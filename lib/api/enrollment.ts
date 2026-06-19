import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/server';
import { createSpeakerProfile, enrollVoice, deleteSpeakerProfile, resetEnrollment } from '@/lib/services/speaker-recognition-service';
import { uploadEnrollmentAudio } from '@/lib/services/blob-storage.service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function initializeEnrollment() {
  const user = await requireAuth();
  const supabase = getServerClient();

  // Check if profile already exists
  const { data: existingProfile } = await supabase
    .from('speaker_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (existingProfile) {
    return { profile: existingProfile, existing: true };
  }

  // Create Azure profile
  try {
    const { profileId } = await createSpeakerProfile(user.id);

    const { data: profile, error } = await supabase
      .from('speaker_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) return { error: error.message };
    return { profile, existing: false, azureProfileId: profileId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create profile' };
  }
}

export async function processVoiceEnrollment(formData: FormData) {
  const user = await requireAuth();
  const supabase = getServerClient();

  // Get profile
  const { data: speakerProfile } = await supabase
    .from('speaker_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!speakerProfile || !speakerProfile.azure_profile_id) {
    return { error: 'Speaker profile not initialized' };
  }

  const audioData = formData.get('audio') as File;
  if (!audioData) {
    return { error: 'No audio data provided' };
  }

  // Convert to buffer
  const arrayBuffer = await audioData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    // Save to storage
    const enrollmentId = crypto.randomUUID();
    const storageResult = await uploadEnrollmentAudio(user.id, enrollmentId, buffer);

    // Enroll with Azure
    const result = await enrollVoice(
      speakerProfile.azure_profile_id,
      user.id,
      arrayBuffer
    );

    if (!result.success) {
      return { error: result.error || 'Enrollment failed' };
    }

    // Update enrollment record with blob URL
    await supabase
      .from('voice_enrollments')
      .update({ audio_blob_url: storageResult.blobUrl })
      .eq('id', result.enrollmentId);

    return {
      success: true,
      remainingEnrollments: result.remainingEnrollments || 0,
      enrollmentStatus: result.enrollmentStatus || 'Enrolling',
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Processing failed' };
  }
}

export async function getEnrollmentStatus() {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: profile, error } = await supabase
    .from('speaker_profiles')
    .select('*, voice_enrollments(*)')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return { error: error.message };
  }

  return { profile };
}

export async function deleteEnrollment() {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: profile } = await supabase
    .from('speaker_profiles')
    .select('azure_profile_id')
    .eq('user_id', user.id)
    .single();

  if (profile?.azure_profile_id) {
    try {
      await deleteSpeakerProfile(profile.azure_profile_id);
    } catch (error) {
      console.error('Failed to delete Azure profile:', error);
    }
  }

  // Delete local records
  await supabase.from('voice_enrollments').delete().eq('user_id', user.id);
  await supabase.from('speaker_profiles').delete().eq('user_id', user.id);

  return { success: true };
}

export async function restartEnrollment() {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: profile } = await supabase
    .from('speaker_profiles')
    .select('azure_profile_id')
    .eq('user_id', user.id)
    .single();

  if (profile?.azure_profile_id) {
    try {
      const result = await resetEnrollment(profile.azure_profile_id, user.id);
      return result;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Reset failed' };
    }
  }

  return { error: 'No profile found' };
}

export async function getEnrollableUsers() {
  await requireAuth();
  const supabase = getServerClient();

  // Get all users with their speaker profiles
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, name, email, department, designation, speaker_profiles(*)')
    .order('name');

  if (error) return { error: error.message };

  return { users };
}
