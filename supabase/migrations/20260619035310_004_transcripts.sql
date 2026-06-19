-- Transcripts (main transcript record for a meeting)
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  blob_url TEXT,
  word_count INT DEFAULT 0,
  speaker_count INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  language TEXT DEFAULT 'en-US',
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcript Segments (individual speech segments with speaker identification)
CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID REFERENCES transcripts(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  speaker_profile_id UUID REFERENCES speaker_profiles(id) ON DELETE SET NULL,
  speaker_name TEXT NOT NULL,
  speaker_confidence FLOAT DEFAULT 0 CHECK (speaker_confidence >= 0 AND speaker_confidence <= 1),
  is_unknown_speaker BOOLEAN DEFAULT false,
  text TEXT NOT NULL,
  start_offset_seconds FLOAT NOT NULL,
  end_offset_seconds FLOAT NOT NULL,
  word_count INT DEFAULT 0,
  azure_turn_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;

-- RLS for transcripts
CREATE POLICY "transcripts_select" ON transcripts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.created_by = auth.uid() OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())))
  );

CREATE POLICY "transcripts_select_admin" ON transcripts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "transcripts_insert" ON transcripts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

CREATE POLICY "transcripts_update" ON transcripts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

-- RLS for transcript_segments  
CREATE POLICY "transcript_segments_select" ON transcript_segments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM transcripts t JOIN meetings m ON m.id = t.meeting_id WHERE t.id = transcript_id AND (m.created_by = auth.uid() OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())))
  );

CREATE POLICY "transcript_segments_insert" ON transcript_segments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM transcripts t JOIN meetings m ON m.id = t.meeting_id WHERE t.id = transcript_id AND m.created_by = auth.uid())
  );

-- Indexes
CREATE INDEX idx_transcripts_meeting ON transcripts(meeting_id);
CREATE INDEX idx_transcript_segments_transcript ON transcript_segments(transcript_id);
CREATE INDEX idx_transcript_segments_speaker ON transcript_segments(speaker_user_id);
CREATE INDEX idx_transcript_segments_offset ON transcript_segments(start_offset_seconds);

-- Triggers
CREATE TRIGGER transcripts_updated_at
  BEFORE UPDATE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();