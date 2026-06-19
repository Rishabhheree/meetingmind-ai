import { createClient } from '@supabase/supabase-js';
import { requireAuth, requireAdmin } from '@/lib/auth/server';
import { subDays, startOfDay, startOfWeek, startOfMonth, differenceInSeconds } from 'date-fns';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getDashboardStats() {
  await requireAuth();
  const supabase = getServerClient();

  // Get user counts
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const { count: enrolledSpeakers } = await supabase
    .from('speaker_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_status', 'enrolled');

  // Get meeting counts
  const { count: totalMeetings } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'cancelled');

  const { count: activeMeetings } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  // Get action items
  const { count: pendingActionItems } = await supabase
    .from('action_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: overdueActionItems } = await supabase
    .from('action_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString());

  // Get overall recognition accuracy (average confidence)
  const { data: segments } = await supabase
    .from('transcript_segments')
    .select('speaker_confidence')
    .eq('is_unknown_speaker', false)
    .limit(1000);

  const recognitionAccuracy = segments && segments.length > 0
    ? segments.reduce((sum, s) => sum + (s.speaker_confidence || 0), 0) / segments.length
    : 0;

  return {
    totalUsers: totalUsers || 0,
    enrolledSpeakers: enrolledSpeakers || 0,
    totalMeetings: totalMeetings || 0,
    activeMeetings: activeMeetings || 0,
    pendingActionItems: pendingActionItems || 0,
    overdueActionItems: overdueActionItems || 0,
    recognitionAccuracy,
  };
}

export async function getRecentMeetings(limit: number = 10) {
  await requireAuth();
  const supabase = getServerClient();

  const { data: meetings, error } = await supabase
    .from('meetings')
    .select(`
      id,
      name,
      status,
      started_at,
      ended_at,
      duration_seconds,
      profiles:created_by(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return { meetings };
}

export async function getAnalytics(options?: { period?: 'day' | 'week' | 'month' | 'year' }) {
  await requireAuth();
  const supabase = getServerClient();

  const period = options?.period || 'month';
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = startOfDay(now);
      break;
    case 'week':
      startDate = startOfWeek(now);
      break;
    case 'month':
      startDate = startOfMonth(now);
      break;
    case 'year':
      startDate = subDays(now, 365);
      break;
    default:
      startDate = subDays(now, 30);
  }

  // Meeting analytics
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, started_at, ended_at, duration_seconds, status')
    .eq('status', 'completed')
    .gte('started_at', startDate.toISOString());

  const totalMeetings = meetings?.length || 0;
  const totalDuration = meetings?.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) || 0;
  const avgDuration = totalMeetings > 0 ? totalDuration / totalMeetings : 0;

  // Transcription analytics
  const { data: transcripts } = await supabase
    .from('transcripts')
    .select('id, word_count, speaker_count')
    .gte('created_at', startDate.toISOString());

  const totalTranscripts = transcripts?.length || 0;
  const totalWords = transcripts?.reduce((sum, t) => sum + (t.word_count || 0), 0) || 0;
  const avgWordsPerMeeting = totalTranscripts > 0 ? totalWords / totalTranscripts : 0;

  // Speaker analytics
  const { count: totalSpeakers } = await supabase
    .from('speaker_profiles')
    .select('id', { count: 'exact', head: true });

  const { count: enrolledSpeakers } = await supabase
    .from('speaker_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_status', 'enrolled');

  // Recognition accuracy
  const { data: recentSegments } = await supabase
    .from('transcript_segments')
    .select('speaker_confidence, is_unknown_speaker')
    .gte('created_at', startDate.toISOString());

  const knownSegments = recentSegments?.filter((s) => !s.is_unknown_speaker) || [];
  const averageRecognition = knownSegments.length > 0
    ? knownSegments.reduce((sum, s) => sum + (s.speaker_confidence || 0), 0) / knownSegments.length
    : 0;

  const unidentifiedCount = recentSegments?.filter((s) => s.is_unknown_speaker).length || 0;
  const totalSegments = recentSegments?.length || 0;
  const idRate = totalSegments > 0 ? (totalSegments - unidentifiedCount) / totalSegments : 0;

  // Action items
  const { data: actionItems } = await supabase
    .from('action_items')
    .select('status, due_date')
    .gte('created_at', startDate.toISOString());

  const completedItems = actionItems?.filter((a) => a.status === 'completed').length || 0;
  const pendingItems = actionItems?.filter((a) => a.status === 'pending').length || 0;
  const overdueItems = actionItems?.filter((a) => a.status === 'pending' && a.due_date && new Date(a.due_date) < now).length || 0;
  const completionRate = actionItems && actionItems.length > 0 ? completedItems / actionItems.length : 0;

  // Time-based trends
  const { data: dailyMeetings } = await supabase
    .from('meetings')
    .select('created_at')
    .eq('status', 'completed')
    .gte('started_at', startDate.toISOString());

  const meetingsByDay: Record<string, number> = {};
  dailyMeetings?.forEach((m) => {
    if (m.created_at) {
      const day = new Date(m.created_at).toISOString().split('T')[0];
      meetingsByDay[day] = (meetingsByDay[day] || 0) + 1;
    }
  });

  // Department breakdown
  const { data: departmentData } = await supabase
    .from('profiles')
    .select('department, count:departments');

  const departments: Record<string, number> = {};
  departmentData?.forEach((p) => {
    if (p.department) {
      departments[p.department] = (departments[p.department] || 0) + 1;
    }
  });

  return {
    period,
    meetings: {
      total: totalMeetings,
      totalDuration,
      avgDuration,
      byDay: Object.entries(meetingsByDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    transcriptions: {
      total: totalTranscripts,
      totalWords,
      avgWordsPerMeeting,
    },
    speakers: {
      total: totalSpeakers || 0,
      enrolled: enrolledSpeakers || 0,
      recognitionRate: idRate,
      avgConfidence: averageRecognition,
    },
    actionItems: {
      total: actionItems?.length || 0,
      completed: completedItems,
      pending: pendingItems,
      overdue: overdueItems,
      completionRate,
    },
    departments,
  };
}

export async function getSystemHealth() {
  await requireAdmin();
  const supabase = getServerClient();

  // Check recent errors or issues
  const { count: failedSummaries } = await supabase
    .from('meeting_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');

  const { count: failedEnrollments } = await supabase
    .from('voice_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');

  // Database size estimation
  const { data: tableSizes } = await supabase.rpc('get_table_sizes');

  return {
    healthy: true, // Simplified health check
    failedSummaries: failedSummaries || 0,
    failedEnrollments: failedEnrollments || 0,
    tableSizes: tableSizes || [],
  };
}
