import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createMeeting(data: {
  name: string;
  description?: string;
  transcription_enabled?: boolean;
  speaker_id_enabled?: boolean;
}) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      name: data.name,
      description: data.description || null,
      created_by: user.id,
      status: 'scheduled',
      transcription_enabled: data.transcription_enabled ?? true,
      speaker_id_enabled: data.speaker_id_enabled ?? true,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Add creator as host participant
  await supabase.from('meeting_participants').insert({
    meeting_id: meeting.id,
    user_id: user.id,
    display_name: user.name,
    is_host: true,
    join_time: new Date().toISOString(),
  });

  return { meeting };
}

export async function startMeeting(meetingId: string) {
  const user = await requireAuth();
  const supabase = getServerClient();

  // Verify the meeting exists and user is host
  const { data: participant } = await supabase
    .from('meeting_participants')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .eq('is_host', true)
    .single();

  if (!participant) return { error: 'You are not the host of this meeting' };

  const { data: meeting, error } = await supabase
    .from('meetings')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) return { error: error.message };

  // Create transcript record
  await supabase.from('transcripts').insert({
    meeting_id: meetingId,
    status: 'processing',
  });

  return { meeting };
}

export async function endMeeting(meetingId: string) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, meeting_participants!inner(*)')
    .eq('id', meetingId)
    .eq('meeting_participants.user_id', user.id)
    .eq('meeting_participants.is_host', true)
    .single();

  if (!meeting) return { error: 'Not authorized' };

  const startedAt = new Date(meeting.started_at || meeting.created_at);
  const endedAt = new Date();
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  const { data: updated, error } = await supabase
    .from('meetings')
    .update({
      status: 'completed',
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) return { error: error.message };

  // Update participant leave times
  await supabase
    .from('meeting_participants')
    .update({ leave_time: endedAt.toISOString() })
    .eq('meeting_id', meetingId)
    .is('leave_time', null);

  // Update transcript status
  await supabase.from('transcripts').update({ status: 'completed' }).eq('meeting_id', meetingId);

  return { meeting: updated };
}

export async function getMeeting(meetingId: string) {
  await requireAuth();
  const supabase = getServerClient();

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select(`
      *,
      profiles:created_by(id, name, email, avatar_url),
      meeting_participants(*, profiles(id, name, email)),
      transcripts(
        *,
        transcript_segments(*)
      ),
      meeting_summaries(*),
      action_items(*)
    `)
    .eq('id', meetingId)
    .single();

  if (error) return { error: error.message };
  return { meeting };
}

export async function getMeetings(options?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const from = (page - 1) * limit;

  let query = supabase
    .from('meetings')
    .select(`*, profiles:created_by(id, name, email)`, { count: 'exact' });

  // User can only see meetings they created or participated in
  query = query.or(`created_by.eq.${user.id},id.in.(select meeting_id from meeting_participants where user_id = '${user.id}')`);

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.search) {
    query = query.ilike('name', `%${options.search}%`);
  }

  const { data, error, count } = await query
    .range(from, from + limit - 1)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { meetings: data, total: count || 0 };
}

export async function updateMeeting(
  meetingId: string,
  data: { name?: string; description?: string }
) {
  const user = await requireAuth();
  const supabase = getServerClient();

  // Verify ownership
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', meetingId)
    .eq('created_by', user.id)
    .single();

  if (!meeting) return { error: 'Not authorized' };

  const { data: updated, error } = await supabase
    .from('meetings')
    .update(data)
    .eq('id', meetingId)
    .select()
    .single();

  if (error) return { error: error.message };

  return { meeting: updated };
}

export async function deleteMeeting(meetingId: string) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', meetingId)
    .eq('created_by', user.id)
    .single();

  if (!meeting) return { error: 'Not authorized' };

  const { error } = await supabase.from('meetings').delete().eq('id', meetingId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function joinMeeting(meetingId: string, displayName: string) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { error } = await supabase.from('meeting_participants').insert({
    meeting_id: meetingId,
    user_id: user.id,
    display_name: displayName || user.name,
    join_time: new Date().toISOString(),
    is_host: false,
  });

  if (error) return { error: error.message };

  return { success: true };
}

export async function leaveMeeting(meetingId: string) {
  const user = await requireAuth();
  const supabase = getServerClient();

  const { error } = await supabase
    .from('meeting_participants')
    .update({ leave_time: new Date().toISOString() })
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .is('leave_time', null);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getMeetingParticipants(meetingId: string) {
  await requireAuth();
  const supabase = getServerClient();

  const { data: participants, error } = await supabase
    .from('meeting_participants')
    .select('*, profiles(id, name, email, avatar_url), speaker_profiles(id, azure_profile_id, enrollment_status)')
    .eq('meeting_id', meetingId)
    .order('join_time', { ascending: true });

  if (error) return { error: error.message };
  return { participants };
}
