import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/server';
import { generateSummary } from '@/lib/services/summary-service';
import { uploadTranscript } from '@/lib/services/blob-storage.service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function saveTranscriptSegment(data: {
  transcriptId: string;
  meetingId: string;
  speakerName: string;
  speakerConfidence: number;
  isUnknownSpeaker: boolean;
  speakerUserId?: string;
  speakerProfileId?: string;
  text: string;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  azureTurnId?: string;
}) {
  await requireAuth();
  const supabase = getServerClient();

  const wordCount = data.text.split(/\s+/).filter(Boolean).length;

  const { data: segment, error } = await supabase
    .from('transcript_segments')
    .insert({
      transcript_id: data.transcriptId,
      meeting_id: data.meetingId,
      speaker_user_id: data.speakerUserId || null,
      speaker_profile_id: data.speakerProfileId || null,
      speaker_name: data.speakerName,
      speaker_confidence: data.speakerConfidence,
      is_unknown_speaker: data.isUnknownSpeaker,
      text: data.text,
      start_offset_seconds: data.startOffsetSeconds,
      end_offset_seconds: data.endOffsetSeconds,
      word_count: wordCount,
      azure_turn_id: data.azureTurnId || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Update transcript stats
  await updateTranscriptStats(data.transcriptId);

  return { segment };
}

async function updateTranscriptStats(transcriptId: string) {
  const supabase = getServerClient();

  const { data: segments } = await supabase
    .from('transcript_segments')
    .select('word_count, end_offset_seconds, speaker_profile_id')
    .eq('transcript_id', transcriptId);

  if (segments && segments.length > 0) {
    const totalWords = segments.reduce((sum, s) => sum + (s.word_count || 0), 0);
    const maxOffset = Math.max(...segments.map((s) => s.end_offset_seconds || 0));
    const uniqueSpeakers = new Set(segments.map((s) => s.speaker_profile_id).filter(Boolean));

    await supabase
      .from('transcripts')
      .update({
        word_count: totalWords,
        duration_seconds: Math.round(maxOffset),
        speaker_count: uniqueSpeakers.size,
      })
      .eq('id', transcriptId);
  }
}

export async function getTranscript(transcriptId: string) {
  await requireAuth();
  const supabase = getServerClient();

  const { data: transcript, error } = await supabase
    .from('transcripts')
    .select(`
      *,
      transcript_segments(*, profiles(id, name, email)),
      meetings(id, name)
    `)
    .eq('id', transcriptId)
    .single();

  if (error) return { error: error.message };
  return { transcript };
}

export async function getMeetingTranscript(meetingId: string) {
  await requireAuth();
  const supabase = getServerClient();

  const { data: transcript, error } = await supabase
    .from('transcripts')
    .select(`
      *,
      transcript_segments(*)
    `)
    .eq('meeting_id', meetingId)
    .single();

  if (error) return { error: error.message };
  return { transcript };
}

export async function getTranscriptSegments(options: {
  meetingId?: string;
  transcriptId?: string;
  speakerId?: string;
  offset?: number;
  limit?: number;
}) {
  await requireAuth();
  const supabase = getServerClient();

  let query = supabase.from('transcript_segments').select('*, profiles(id, name)');

  if (options.meetingId) query = query.eq('meeting_id', options.meetingId);
  if (options.transcriptId) query = query.eq('transcript_id', options.transcriptId);
  if (options.speakerId) query = query.eq('speaker_user_id', options.speakerId);

  const offset = options.offset || 0;
  const limit = options.limit || 100;

  const { data: segments, error } = await query
    .order('start_offset_seconds', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return { error: error.message };
  return { segments };
}

export async function finalizeTranscript(transcriptId: string) {
  await requireAuth();
  const supabase = getServerClient();

  // Get all segments
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('meeting_id, transcript_segments(*)')
    .eq('id', transcriptId)
    .single();

  if (!transcript) return { error: 'Transcript not found' };

  // Format transcript for storage
  const formattedTranscript = transcript.transcript_segments.map((seg: { speaker_name: string; text: string; start_offset_seconds: number }) => ({
    speaker: seg.speaker_name,
    text: seg.text,
    timestamp: formatTimestamp(seg.start_offset_seconds),
  }));

  // Upload to blob storage
  const blobResult = await uploadTranscript(
    transcript.meeting_id,
    JSON.stringify(formattedTranscript, null, 2)
  );

  // Update transcript record
  await supabase
    .from('transcripts')
    .update({
      blob_url: blobResult.blobUrl,
      status: 'completed',
    })
    .eq('id', transcriptId);

  // Generate AI summary
  const segments = transcript.transcript_segments.map((seg: { speaker_name: string; text: string; start_offset_seconds: number }) => ({
    speaker_name: seg.speaker_name,
    text: seg.text,
    timestamp: formatTimestamp(seg.start_offset_seconds),
  }));

  try {
    await generateSummary(transcript.meeting_id, segments);
  } catch (error) {
    console.error('Summary generation failed:', error);
  }

  return { success: true, blobUrl: blobResult.blobUrl };
}

export async function exportTranscript(transcriptId: string, format: 'json' | 'txt' | 'srt') {
  await requireAuth();
  const supabase = getServerClient();

  const { data: transcript } = await supabase
    .from('transcripts')
    .select('*, transcript_segments(*)')
    .eq('id', transcriptId)
    .single();

  if (!transcript) return { error: 'Transcript not found' };

  let content: string;
  let filename: string;

  switch (format) {
    case 'json':
      content = JSON.stringify(transcript.transcript_segments, null, 2);
      filename = `transcript_${transcriptId}.json`;
      break;
    case 'txt':
      content = transcript.transcript_segments
        .map((seg: { speaker_name: string; text: string; start_offset_seconds: number }) => {
          const ts = formatTimestamp(seg.start_offset_seconds);
          return `[${ts}] ${seg.speaker_name}: ${seg.text}`;
        })
        .join('\n\n');
      filename = `transcript_${transcriptId}.txt`;
      break;
    case 'srt':
      content = transcript.transcript_segments
        .map((seg: { speaker_name: string; text: string; start_offset_seconds: number; end_offset_seconds: number }, i: number) => {
          const start = formatSrtTime(seg.start_offset_seconds);
          const end = formatSrtTime(seg.end_offset_seconds);
          return `${i + 1}\n${start} --> ${end}\n${seg.speaker_name}: ${seg.text}\n`;
        })
        .join('\n');
      filename = `transcript_${transcriptId}.srt`;
      break;
    default:
      return { error: 'Invalid format' };
  }

  return { content, filename };
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export async function searchTranscripts(query: string, options?: { meetingId?: string; speakerId?: string }) {
  await requireAuth();
  const supabase = getServerClient();

  let q = supabase
    .from('transcript_segments')
    .select('*, meetings(id, name), profiles(id, name)')
    .textSearch('text', query);

  if (options?.meetingId) q = q.eq('meeting_id', options.meetingId);
  if (options?.speakerId) q = q.eq('speaker_user_id', options.speakerId);

  const { data: segments, error } = await q.limit(50);

  if (error) return { error: error.message };
  return { segments };
}
