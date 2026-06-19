import { createClient } from '@supabase/supabase-js';

const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface SpeakerProfileResult {
  profileId: string;
  userId: string;
  enrollmentStatus: 'pending' | 'enrolling' | 'enrolled' | 'failed';
  confidence: number;
  name: string;
  email: string;
}

export interface EnrollmentResult {
  success: boolean;
  enrollmentId?: string;
  profileId?: string;
  enrollmentStatus?: string;
  remainingEnrollments?: number;
  error?: string;
}

export interface IdentificationResult {
  speakerName: string;
  confidence: number;
  profileId?: string;
  userId?: string;
  isUnknown: boolean;
}

const BASE_URL = `https://${speechRegion}.api.cognitive.microsoft.com/speaker-recognition/v1.0/identification-profiles`;

async function makeAzureRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: unknown
): Promise<Response> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey || '',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

export async function createSpeakerProfile(userId: string, locale: string = 'en-US'): Promise<{ profileId: string }> {
  const response = await makeAzureRequest('', 'POST', { locale });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create speaker profile: ${error}`);
  }

  const result = await response.json();
  const profileId = result.identificationProfileId;

  // Store the profile in database
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('speaker_profiles').upsert({
    user_id: userId,
    azure_profile_id: profileId,
    enrollment_status: 'pending',
    confidence: 0,
    enrollment_count: 0,
  });

  return { profileId };
}

export async function deleteSpeakerProfile(profileId: string): Promise<void> {
  const response = await makeAzureRequest(`/${profileId}`, 'DELETE');

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete speaker profile: ${error}`);
  }

  // Remove from database
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('speaker_profiles').delete().eq('azure_profile_id', profileId);
}

export async function enrollVoice(
  profileId: string,
  userId: string,
  audioData: ArrayBuffer
): Promise<EnrollmentResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create enrollment record
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('voice_enrollments')
    .insert({
      user_id: userId,
      status: 'processing',
    })
    .select()
    .single();

  if (enrollmentError || !enrollment) {
    throw new Error('Failed to create enrollment record');
  }

  // Get the speaker profile to link enrollment
  const { data: speakerProfile } = await supabase
    .from('speaker_profiles')
    .select('id')
    .eq('azure_profile_id', profileId)
    .single();

  try {
    // Azure API requires direct audio binary upload
    const response = await fetch(`${BASE_URL}/${profileId}/enroll`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey || '',
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      },
      body: audioData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const result = await response.json();
    const status = result.identificationProfile?.enrollmentStatus || 'Enrolling';
    const remaining = result.identificationProfile?.remainingEnrollmentSpeechLength || 0;

    // Update enrollment status
    await supabase
      .from('voice_enrollments')
      .update({
        speaker_profile_id: speakerProfile?.id,
        status: 'completed',
        duration_seconds: audioData.byteLength / 32000,
      })
      .eq('id', enrollment.id);

    // Update speaker profile
    await supabase
      .from('speaker_profiles')
      .update({
        enrollment_status: status === 'Enrolled' ? 'enrolled' : 'enrolling',
        enrollment_count: 30 - Math.round(remaining / 1000),
        last_enrollment_at: new Date().toISOString(),
      })
      .eq('azure_profile_id', profileId);

    return {
      success: true,
      enrollmentId: enrollment.id,
      profileId,
      enrollmentStatus: status,
      remainingEnrollments: Math.ceil(remaining / 1000),
    };
  } catch (error) {
    // Mark enrollment as failed
    await supabase
      .from('voice_enrollments')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', enrollment.id);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Enrollment failed',
    };
  }
}

export async function identifySpeaker(
  audioData: ArrayBuffer,
  profileIds: string[]
): Promise<IdentificationResult> {
  if (profileIds.length === 0) {
    return {
      speakerName: 'Unknown Speaker',
      confidence: 0,
      isUnknown: true,
    };
  }

  try {
    const response = await fetch(
      `https://${speechRegion}.api.cognitive.microsoft.com/speaker-recognition/v1.0/identify?identifySpeaker` +
        `?shortAudio=true`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey || '',
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        },
        body: audioData,
      }
    );

    if (!response.ok) {
      // No match found - unknown speaker
      return {
        speakerName: 'Unknown Speaker',
        confidence: 0,
        isUnknown: true,
      };
    }

    const result = await response.json();
    const identifiedProfileId = result.identifiedProfile?.identificationProfileId;
    const confidence = result.identifiedProfile?.confidence || 0;

    if (!identifiedProfileId || confidence < 0.5) {
      return {
        speakerName: 'Unknown Speaker',
        confidence,
        isUnknown: true,
      };
    }

    // Look up the profile in our database
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await supabase
      .from('speaker_profiles')
      .select('*, profiles(name, email)')
      .eq('azure_profile_id', identifiedProfileId)
      .single();

    return {
      speakerName: profile?.profiles?.name || 'Unknown Speaker',
      confidence,
      profileId: identifiedProfileId,
      userId: profile?.user_id || undefined,
      isUnknown: !profile,
    };
  } catch {
    return {
      speakerName: 'Unknown Speaker',
      confidence: 0,
      isUnknown: true,
    };
  }
}

export async function getSpeakerProfiles(): Promise<SpeakerProfileResult[]> {
  const response = await makeAzureRequest('s');

  if (!response.ok) {
    return [];
  }

  const profiles = await response.json();

  // Get profile details from database
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: dbProfiles } = await supabase
    .from('speaker_profiles')
    .select('*, profiles(name, email)')
    .eq('enrollment_status', 'enrolled');

  return (dbProfiles || []).map((p) => ({
    profileId: p.azure_profile_id,
    userId: p.user_id,
    enrollmentStatus: p.enrollment_status,
    confidence: p.confidence,
    name: p.profiles?.name || 'Unknown',
    email: p.profiles?.email || '',
  }));
}

export async function resetEnrollment(profileId: string, userId: string): Promise<EnrollmentResult> {
  try {
    // Delete profile from Azure
    await deleteSpeakerProfile(profileId);

    // Create new profile
    const newProfile = await createSpeakerProfile(userId);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Reset enrollment status
    await supabase.from('speaker_profiles').update({
      enrollment_status: 'pending',
      enrollment_count: 0,
      confidence: 0,
    }).eq('azure_profile_id', newProfile.profileId);

    return {
      success: true,
      profileId: newProfile.profileId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reset failed',
    };
  }
}
