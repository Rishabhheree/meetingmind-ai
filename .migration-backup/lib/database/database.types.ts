export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
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
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          department?: string | null;
          designation?: string | null;
          employee_id?: string | null;
          avatar_url?: string | null;
          role?: 'admin' | 'user';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          department?: string | null;
          designation?: string | null;
          employee_id?: string | null;
          avatar_url?: string | null;
          role?: 'admin' | 'user';
          created_at?: string;
          updated_at?: string;
        };
      };
      speaker_profiles: {
        Row: {
          id: string;
          user_id: string;
          azure_profile_id: string | null;
          enrollment_status: 'pending' | 'enrolling' | 'enrolled' | 'failed';
          confidence: number;
          enrollment_count: number;
          last_enrollment_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          azure_profile_id?: string | null;
          enrollment_status?: 'pending' | 'enrolling' | 'enrolled' | 'failed';
          confidence?: number;
          enrollment_count?: number;
          last_enrollment_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          azure_profile_id?: string | null;
          enrollment_status?: 'pending' | 'enrolling' | 'enrolled' | 'failed';
          confidence?: number;
          enrollment_count?: number;
          last_enrollment_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      voice_enrollments: {
        Row: {
          id: string;
          user_id: string;
          speaker_profile_id: string | null;
          audio_blob_url: string | null;
          duration_seconds: number | null;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          error_message: string | null;
          azure_audio_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          speaker_profile_id?: string | null;
          audio_blob_url?: string | null;
          duration_seconds?: number | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          error_message?: string | null;
          azure_audio_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          speaker_profile_id?: string | null;
          audio_blob_url?: string | null;
          duration_seconds?: number | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          error_message?: string | null;
          azure_audio_id?: string | null;
          created_at?: string;
        };
      };
      meetings: {
        Row: {
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
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          status?: 'scheduled' | 'active' | 'completed' | 'cancelled';
          participant_count?: number;
          transcription_enabled?: boolean;
          speaker_id_enabled?: boolean;
          azure_conversation_id?: string | null;
          blob_storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_by?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          status?: 'scheduled' | 'active' | 'completed' | 'cancelled';
          participant_count?: number;
          transcription_enabled?: boolean;
          speaker_id_enabled?: boolean;
          azure_conversation_id?: string | null;
          blob_storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      meeting_participants: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string | null;
          speaker_profile_id: string | null;
          display_name: string;
          join_time: string | null;
          leave_time: string | null;
          is_host: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id?: string | null;
          speaker_profile_id?: string | null;
          display_name: string;
          join_time?: string | null;
          leave_time?: string | null;
          is_host?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          user_id?: string | null;
          speaker_profile_id?: string | null;
          display_name?: string;
          join_time?: string | null;
          leave_time?: string | null;
          is_host?: boolean;
          created_at?: string;
        };
      };
      transcripts: {
        Row: {
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
        };
        Insert: {
          id?: string;
          meeting_id: string;
          blob_url?: string | null;
          word_count?: number;
          speaker_count?: number;
          duration_seconds?: number;
          language?: string;
          status?: 'processing' | 'completed' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          blob_url?: string | null;
          word_count?: number;
          speaker_count?: number;
          duration_seconds?: number;
          language?: string;
          status?: 'processing' | 'completed' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
      };
      transcript_segments: {
        Row: {
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
        };
        Insert: {
          id?: string;
          transcript_id: string;
          meeting_id: string;
          speaker_user_id?: string | null;
          speaker_profile_id?: string | null;
          speaker_name: string;
          speaker_confidence?: number;
          is_unknown_speaker?: boolean;
          text: string;
          start_offset_seconds: number;
          end_offset_seconds: number;
          word_count?: number;
          azure_turn_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          meeting_id?: string;
          speaker_user_id?: string | null;
          speaker_profile_id?: string | null;
          speaker_name?: string;
          speaker_confidence?: number;
          is_unknown_speaker?: boolean;
          text?: string;
          start_offset_seconds?: number;
          end_offset_seconds?: number;
          word_count?: number;
          azure_turn_id?: string | null;
          created_at?: string;
        };
      };
      meeting_summaries: {
        Row: {
          id: string;
          meeting_id: string;
          summary: string;
          key_topics: string[];
          decisions: string[];
          action_items: Json;
          sentiment: string | null;
          participant_insights: Json | null;
          processing_time_seconds: number | null;
          tokens_used: number | null;
          model_used: string | null;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          summary: string;
          key_topics?: string[];
          decisions?: string[];
          action_items?: Json;
          sentiment?: string | null;
          participant_insights?: Json | null;
          processing_time_seconds?: number | null;
          tokens_used?: number | null;
          model_used?: string | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          summary?: string;
          key_topics?: string[];
          decisions?: string[];
          action_items?: Json;
          sentiment?: string | null;
          participant_insights?: Json | null;
          processing_time_seconds?: number | null;
          tokens_used?: number | null;
          model_used?: string | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
      };
      action_items: {
        Row: {
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
        };
        Insert: {
          id?: string;
          meeting_id: string;
          assigned_to?: string | null;
          summary_id?: string | null;
          title: string;
          description?: string | null;
          due_date?: string | null;
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          completed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          assigned_to?: string | null;
          summary_id?: string | null;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          completed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
