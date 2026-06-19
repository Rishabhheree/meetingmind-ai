// Database types - mirrors Supabase schema

export interface Profile {
  id: string;
  name: string;
  email: string;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  avatar_url: string | null;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

export interface SpeakerProfile {
  id: string;
  user_id: string;
  azure_profile_id: string | null;
  enrollment_status: 'pending' | 'enrolling' | 'enrolled' | 'failed';
  confidence: number;
  enrollment_count: number;
  last_enrollment_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceEnrollment {
  id: string;
  user_id: string;
  speaker_profile_id: string | null;
  audio_blob_url: string | null;
  duration_seconds: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  azure_audio_id: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  participant_count: number;
  transcription_enabled: boolean;
  speaker_id_enabled: boolean;
  azure_conversation_id: string | null;
  blob_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string | null;
  speaker_profile_id: string | null;
  display_name: string;
  join_time: string | null;
  leave_time: string | null;
  is_host: boolean;
  created_at: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  blob_url: string | null;
  word_count: number;
  speaker_count: number;
  duration_seconds: number;
  language: string;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  transcript_id: string;
  meeting_id: string;
  speaker_user_id: string | null;
  speaker_profile_id: string | null;
  speaker_name: string;
  speaker_confidence: number;
  is_unknown_speaker: boolean;
  text: string;
  start_offset_seconds: number;
  end_offset_seconds: number;
  word_count: number;
  azure_turn_id: string | null;
  created_at: string;
}

export interface MeetingSummary {
  id: string;
  meeting_id: string;
  summary: string;
  key_topics: string[];
  decisions: string[];
  action_items: ActionItemData[];
  sentiment: string | null;
  participant_insights: Record<string, unknown> | null;
  processing_time_seconds: number | null;
  tokens_used: number | null;
  model_used: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface ActionItemData {
  title: string;
  description?: string;
  assigned_to?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  assigned_to: string | null;
  summary_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// API Response types
export interface TranscriptionResult {
  text: string;
  confidence: number;
  speakerId?: string;
  speakerName?: string;
  speakerConfidence?: number;
  isUnknown?: boolean;
  offset: number;
  duration: number;
}

export interface SpeakerIdentificationResult {
  speakerName: string;
  confidence: number;
  profileId?: string;
  userId?: string;
  isUnknown: boolean;
}

export interface EnrollVoiceResult {
  success: boolean;
  enrollmentId?: string;
  profileId?: string;
  error?: string;
  remainingEnrollments?: number;
}

// Meeting session types
export interface MeetingSession {
  meetingId: string;
  meetingName: string;
  status: 'connecting' | 'active' | 'paused' | 'ended';
  startedAt: Date;
  segments: TranscriptSegment[];
  activeSpeaker: string | null;
  speakerConfidence: number;
  isRecording: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

// Dashboard stats
export interface DashboardStats {
  totalUsers: number;
  enrolledSpeakers: number;
  totalMeetings: number;
  recognitionAccuracy: number;
  storageUsed: number;
  storageLimit: number;
  pendingActionItems: number;
  activeMeetings: number;
}

// Analytics types
export interface AnalyticsData {
  meetings: {
    total: number;
    thisMonth: number;
    thisWeek: number;
    today: number;
    avgDuration: number;
    totalDuration: number;
  };
  transcriptions: {
    total: number;
    totalWords: number;
    avgWordsPerMeeting: number;
  };
  speakers: {
    total: number;
    enrolled: number;
    averageRecognition: number;
  };
  actionItems: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
}
