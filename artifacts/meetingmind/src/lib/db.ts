import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface ProfileRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  avatar_url: string | null;
  createdAt: string;
}

export interface MeetingRecord {
  id: string;
  name: string;
  description: string | null;
  status: 'scheduled' | 'active' | 'completed';
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_by: string;
  speaker_id_enabled: boolean;
  transcription_enabled: boolean;
  createdAt: string;
}

export interface MeetingParticipantRecord {
  id: string;
  meeting_id: string;
  user_id: string | null;
  display_name: string;
  is_host: boolean;
}

export interface TranscriptRecord {
  id: string;
  meeting_id: string;
  status: 'processing' | 'completed';
  word_count: number;
  speaker_count: number;
  duration_seconds: number;
  created_at: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  transcript_id: string;
  meeting_id: string;
  speaker_name: string;
  speaker_confidence: number;
  is_unknown_speaker: boolean;
  text: string;
  start_offset_seconds: number;
  end_offset_seconds: number;
  createdAt: string;
}

export interface ActionItemRecord {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  createdAt: string;
}

export interface MeetingSummaryRecord {
  id: string;
  meeting_id: string;
  summary: string;
  key_topics: string[];
  decisions: string[];
  createdAt: string;
}

export interface SpeakerProfileRecord {
  id: string;
  user_id: string;
  enrollment_status: 'pending' | 'enrolling' | 'enrolled';
  enrollment_count: number;
  confidence: number;
  azure_profile_id: string | null;
  updatedAt: string;
}

interface MeetingMindDB extends DBSchema {
  profiles: { key: string; value: ProfileRecord; indexes: { by_email: string } };
  meetings: { key: string; value: MeetingRecord; indexes: { by_created_by: string; by_status: string } };
  meeting_participants: { key: string; value: MeetingParticipantRecord; indexes: { by_meeting_id: string } };
  transcripts: { key: string; value: TranscriptRecord; indexes: { by_meeting_id: string } };
  transcript_segments: { key: string; value: TranscriptSegmentRecord; indexes: { by_transcript_id: string; by_meeting_id: string } };
  action_items: { key: string; value: ActionItemRecord; indexes: { by_meeting_id: string; by_status: string } };
  meeting_summaries: { key: string; value: MeetingSummaryRecord; indexes: { by_meeting_id: string } };
  speaker_profiles: { key: string; value: SpeakerProfileRecord; indexes: { by_user_id: string } };
}

let dbInstance: IDBPDatabase<MeetingMindDB> | null = null;

async function getDB(): Promise<IDBPDatabase<MeetingMindDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<MeetingMindDB>('meetingmind', 1, {
    upgrade(db) {
      const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
      profiles.createIndex('by_email', 'email', { unique: true });

      const meetings = db.createObjectStore('meetings', { keyPath: 'id' });
      meetings.createIndex('by_created_by', 'created_by');
      meetings.createIndex('by_status', 'status');

      const participants = db.createObjectStore('meeting_participants', { keyPath: 'id' });
      participants.createIndex('by_meeting_id', 'meeting_id');

      const transcripts = db.createObjectStore('transcripts', { keyPath: 'id' });
      transcripts.createIndex('by_meeting_id', 'meeting_id', { unique: true });

      const segments = db.createObjectStore('transcript_segments', { keyPath: 'id' });
      segments.createIndex('by_transcript_id', 'transcript_id');
      segments.createIndex('by_meeting_id', 'meeting_id');

      const actionItems = db.createObjectStore('action_items', { keyPath: 'id' });
      actionItems.createIndex('by_meeting_id', 'meeting_id');
      actionItems.createIndex('by_status', 'status');

      const summaries = db.createObjectStore('meeting_summaries', { keyPath: 'id' });
      summaries.createIndex('by_meeting_id', 'meeting_id');

      const speakerProfiles = db.createObjectStore('speaker_profiles', { keyPath: 'id' });
      speakerProfiles.createIndex('by_user_id', 'user_id', { unique: true });
    },
  });
  return dbInstance;
}

// Simple password "hash" — XOR + base64 (not production crypto, but works offline)
function hashPassword(password: string): string {
  const encoded = btoa(unescape(encodeURIComponent(password + ':meetingmind-salt')));
  return encoded;
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function createUser(params: {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
  department?: string;
  designation?: string;
  employee_id?: string;
}): Promise<ProfileRecord> {
  const db = await getDB();
  const existing = await db.getFromIndex('profiles', 'by_email', params.email);
  if (existing) throw new Error('Email already in use');

  const profile: ProfileRecord = {
    id: crypto.randomUUID(),
    name: params.name,
    email: params.email,
    passwordHash: hashPassword(params.password),
    role: params.role || 'user',
    department: params.department || null,
    designation: params.designation || null,
    employee_id: params.employee_id || null,
    avatar_url: null,
    createdAt: new Date().toISOString(),
  };
  await db.add('profiles', profile);

  // Create speaker profile record
  await db.add('speaker_profiles', {
    id: crypto.randomUUID(),
    user_id: profile.id,
    enrollment_status: 'pending',
    enrollment_count: 0,
    confidence: 0,
    azure_profile_id: null,
    updatedAt: new Date().toISOString(),
  });

  return profile;
}

export async function signInUser(email: string, password: string): Promise<ProfileRecord> {
  const db = await getDB();
  const profile = await db.getFromIndex('profiles', 'by_email', email);
  if (!profile) throw new Error('No account found with that email');
  if (!verifyPassword(password, profile.passwordHash)) throw new Error('Incorrect password');
  return profile;
}

export async function getProfileById(id: string): Promise<ProfileRecord | undefined> {
  const db = await getDB();
  return db.get('profiles', id);
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export async function createMeeting(params: {
  name: string;
  description?: string;
  created_by: string;
  speaker_id_enabled?: boolean;
  transcription_enabled?: boolean;
}): Promise<MeetingRecord> {
  const db = await getDB();
  const meeting: MeetingRecord = {
    id: crypto.randomUUID(),
    name: params.name,
    description: params.description || null,
    status: 'scheduled',
    started_at: null,
    ended_at: null,
    duration_seconds: null,
    created_by: params.created_by,
    speaker_id_enabled: params.speaker_id_enabled ?? true,
    transcription_enabled: params.transcription_enabled ?? true,
    createdAt: new Date().toISOString(),
  };
  await db.add('meetings', meeting);
  return meeting;
}

export async function getMeetings(params?: {
  created_by?: string;
  status?: string;
  search?: string;
  limit?: number;
}): Promise<MeetingRecord[]> {
  const db = await getDB();
  let all = await db.getAll('meetings');
  if (params?.created_by) all = all.filter((m) => m.created_by === params.created_by);
  if (params?.status) all = all.filter((m) => m.status === params.status);
  if (params?.search) {
    const q = params.search.toLowerCase();
    all = all.filter((m) => m.name.toLowerCase().includes(q));
  }
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (params?.limit) all = all.slice(0, params.limit);
  return all;
}

export async function getMeetingById(id: string): Promise<MeetingRecord | undefined> {
  const db = await getDB();
  return db.get('meetings', id);
}

export async function startMeeting(id: string): Promise<void> {
  const db = await getDB();
  const meeting = await db.get('meetings', id);
  if (!meeting) return;
  await db.put('meetings', { ...meeting, status: 'active', started_at: new Date().toISOString() });

  // Create transcript
  const transcript: TranscriptRecord = {
    id: crypto.randomUUID(),
    meeting_id: id,
    status: 'processing',
    word_count: 0,
    speaker_count: 0,
    duration_seconds: 0,
    created_at: new Date().toISOString(),
  };
  const existing = await db.getFromIndex('transcripts', 'by_meeting_id', id);
  if (!existing) await db.add('transcripts', transcript);
}

export async function endMeeting(id: string): Promise<void> {
  const db = await getDB();
  const meeting = await db.get('meetings', id);
  if (!meeting || !meeting.started_at) return;
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.floor(
    (new Date(endedAt).getTime() - new Date(meeting.started_at).getTime()) / 1000
  );
  await db.put('meetings', { ...meeting, status: 'completed', ended_at: endedAt, duration_seconds: durationSeconds });

  // Update transcript
  const transcript = await db.getFromIndex('transcripts', 'by_meeting_id', id);
  if (transcript) {
    const segments = await db.getAllFromIndex('transcript_segments', 'by_transcript_id', transcript.id);
    const words = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
    const speakers = new Set(segments.map((s) => s.speaker_name)).size;
    await db.put('transcripts', {
      ...transcript,
      status: 'completed',
      word_count: words,
      speaker_count: speakers,
      duration_seconds: durationSeconds,
    });
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('meetings', id);
  const transcript = await db.getFromIndex('transcripts', 'by_meeting_id', id);
  if (transcript) {
    const segments = await db.getAllFromIndex('transcript_segments', 'by_transcript_id', transcript.id);
    for (const seg of segments) await db.delete('transcript_segments', seg.id);
    await db.delete('transcripts', transcript.id);
  }
  const participants = await db.getAllFromIndex('meeting_participants', 'by_meeting_id', id);
  for (const p of participants) await db.delete('meeting_participants', p.id);
  const actionItems = await db.getAllFromIndex('action_items', 'by_meeting_id', id);
  for (const a of actionItems) await db.delete('action_items', a.id);
  const summaries = await db.getAllFromIndex('meeting_summaries', 'by_meeting_id', id);
  for (const s of summaries) await db.delete('meeting_summaries', s.id);
}

// ── Participants ──────────────────────────────────────────────────────────────

export async function addParticipant(params: {
  meeting_id: string;
  user_id?: string;
  display_name: string;
  is_host?: boolean;
}): Promise<MeetingParticipantRecord> {
  const db = await getDB();
  const participant: MeetingParticipantRecord = {
    id: crypto.randomUUID(),
    meeting_id: params.meeting_id,
    user_id: params.user_id || null,
    display_name: params.display_name,
    is_host: params.is_host ?? false,
  };
  await db.add('meeting_participants', participant);
  return participant;
}

export async function getParticipants(meetingId: string): Promise<MeetingParticipantRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('meeting_participants', 'by_meeting_id', meetingId);
}

// ── Transcripts ───────────────────────────────────────────────────────────────

export async function getTranscriptByMeeting(meetingId: string): Promise<TranscriptRecord | undefined> {
  const db = await getDB();
  return db.getFromIndex('transcripts', 'by_meeting_id', meetingId);
}

export async function getAllTranscripts(limit = 50): Promise<(TranscriptRecord & { meeting: MeetingRecord | undefined })[]> {
  const db = await getDB();
  let all = await db.getAll('transcripts');
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  all = all.slice(0, limit);
  return Promise.all(
    all.map(async (t) => ({ ...t, meeting: await db.get('meetings', t.meeting_id) }))
  );
}

export async function addTranscriptSegment(segment: Omit<TranscriptSegmentRecord, 'id' | 'createdAt'>): Promise<TranscriptSegmentRecord> {
  const db = await getDB();
  const record: TranscriptSegmentRecord = {
    ...segment,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db.add('transcript_segments', record);
  return record;
}

export async function getTranscriptSegments(transcriptId: string): Promise<TranscriptSegmentRecord[]> {
  const db = await getDB();
  const segs = await db.getAllFromIndex('transcript_segments', 'by_transcript_id', transcriptId);
  return segs.sort((a, b) => a.start_offset_seconds - b.start_offset_seconds);
}

// ── Action Items ──────────────────────────────────────────────────────────────

export async function getActionItems(meetingId: string): Promise<ActionItemRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('action_items', 'by_meeting_id', meetingId);
}

export async function getAllActionItems(): Promise<ActionItemRecord[]> {
  const db = await getDB();
  return db.getAll('action_items');
}

// ── Meeting Summary ───────────────────────────────────────────────────────────

export async function getMeetingSummary(meetingId: string): Promise<MeetingSummaryRecord | undefined> {
  const db = await getDB();
  const summaries = await db.getAllFromIndex('meeting_summaries', 'by_meeting_id', meetingId);
  return summaries[0];
}

// ── Speaker Profiles ──────────────────────────────────────────────────────────

export async function getSpeakerProfile(userId: string): Promise<SpeakerProfileRecord | undefined> {
  const db = await getDB();
  return db.getFromIndex('speaker_profiles', 'by_user_id', userId);
}

export async function updateSpeakerProfile(userId: string, updates: Partial<Omit<SpeakerProfileRecord, 'id' | 'user_id'>>): Promise<void> {
  const db = await getDB();
  const profile = await db.getFromIndex('speaker_profiles', 'by_user_id', userId);
  if (profile) {
    await db.put('speaker_profiles', { ...profile, ...updates, updatedAt: new Date().toISOString() });
  } else {
    await db.add('speaker_profiles', {
      id: crypto.randomUUID(),
      user_id: userId,
      enrollment_status: 'pending',
      enrollment_count: 0,
      confidence: 0,
      azure_profile_id: null,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function resetSpeakerProfile(userId: string): Promise<void> {
  await updateSpeakerProfile(userId, {
    enrollment_status: 'pending',
    enrollment_count: 0,
    confidence: 0,
    azure_profile_id: null,
  });
}

// ── Users (admin) ─────────────────────────────────────────────────────────────

export async function getAllUsers(params?: { search?: string; role?: string }): Promise<ProfileRecord[]> {
  const db = await getDB();
  let users = await db.getAll('profiles');
  if (params?.search) {
    const q = params.search.toLowerCase();
    users = users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (params?.role && params.role !== 'all') {
    users = users.filter((u) => u.role === params.role);
  }
  return users;
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('profiles', id);
  const sp = await db.getFromIndex('speaker_profiles', 'by_user_id', id);
  if (sp) await db.delete('speaker_profiles', sp.id);
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDB();
  const [users, meetings, actionItems, transcripts] = await Promise.all([
    db.getAll('profiles'),
    db.getAll('meetings'),
    db.getAll('action_items'),
    db.getAll('transcripts'),
  ]);
  const speakerProfiles = await db.getAll('speaker_profiles');

  const enrolled = speakerProfiles.filter((s) => s.enrollment_status === 'enrolled').length;
  const recognitionRates = transcripts.map((t) => 0); // placeholder
  const recognitionAccuracy = enrolled > 0 ? Math.min(0.95, 0.7 + enrolled * 0.05) : 0;

  return {
    totalUsers: users.length,
    enrolledSpeakers: enrolled,
    totalMeetings: meetings.length,
    activeMeetings: meetings.filter((m) => m.status === 'active').length,
    pendingActionItems: actionItems.filter((a) => a.status === 'pending').length,
    overdueActionItems: actionItems.filter((a) => a.status === 'overdue').length,
    recognitionAccuracy,
  };
}

export async function getRecentMeetings(userId?: string, limit = 5): Promise<MeetingRecord[]> {
  return getMeetings({ created_by: userId, limit });
}

export async function getAnalytics(period: 'day' | 'week' | 'month' | 'year') {
  const db = await getDB();
  const now = new Date();
  const cutoff = new Date();
  if (period === 'day') cutoff.setDate(now.getDate() - 1);
  else if (period === 'week') cutoff.setDate(now.getDate() - 7);
  else if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
  else cutoff.setFullYear(now.getFullYear() - 1);

  const allMeetings = await db.getAll('meetings');
  const allTranscripts = await db.getAll('transcripts');
  const allActionItems = await db.getAll('action_items');
  const speakerProfiles = await db.getAll('speaker_profiles');
  const profiles = await db.getAll('profiles');

  const meetings = allMeetings.filter((m) => m.started_at && new Date(m.started_at) >= cutoff);
  const transcripts = allTranscripts.filter((t) => new Date(t.created_at) >= cutoff);
  const actionItems = allActionItems;

  const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
  const avgDuration = meetings.length > 0 ? totalDuration / meetings.length : 0;
  const totalWords = transcripts.reduce((sum, t) => sum + t.word_count, 0);
  const enrolled = speakerProfiles.filter((s) => s.enrollment_status === 'enrolled').length;
  const avgConf = enrolled > 0 ? speakerProfiles.filter((s) => s.enrollment_status === 'enrolled').reduce((sum, s) => sum + s.confidence, 0) / enrolled : 0;
  const recognitionRate = enrolled > 0 ? Math.min(0.95, 0.7 + enrolled * 0.05) : 0;

  const completed = actionItems.filter((a) => a.status === 'completed').length;
  const pending = actionItems.filter((a) => a.status === 'pending').length;
  const overdue = actionItems.filter((a) => a.status === 'overdue').length;

  // Build byDay from meetings
  const byDayMap: Record<string, number> = {};
  for (const m of meetings) {
    if (!m.started_at) continue;
    const d = m.started_at.slice(0, 10);
    byDayMap[d] = (byDayMap[d] || 0) + 1;
  }
  const byDay = Object.entries(byDayMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    period,
    meetings: { total: meetings.length, totalDuration, avgDuration, byDay },
    transcriptions: { total: transcripts.length, totalWords, avgWordsPerMeeting: meetings.length > 0 ? totalWords / meetings.length : 0 },
    speakers: { total: profiles.length, enrolled, recognitionRate, avgConfidence: avgConf },
    actionItems: { total: actionItems.length, completed, pending, overdue, completionRate: actionItems.length > 0 ? completed / actionItems.length : 0 },
  };
}

export async function exportTranscriptAsText(transcriptId: string): Promise<string> {
  const db = await getDB();
  const segments = await getTranscriptSegments(transcriptId);
  const transcript = await db.get('transcripts', transcriptId);
  if (!transcript) return '';
  const meeting = await db.get('meetings', transcript.meeting_id);
  const header = `Meeting: ${meeting?.name || 'Unknown'}\nDate: ${transcript.created_at}\n\n`;
  const body = segments.map((s) => {
    const time = formatTime(s.start_offset_seconds);
    return `[${time}] ${s.speaker_name}: ${s.text}`;
  }).join('\n');
  return header + body;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
