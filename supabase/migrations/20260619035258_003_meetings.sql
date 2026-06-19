-- Meetings
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  participant_count INT DEFAULT 0,
  transcription_enabled BOOLEAN DEFAULT true,
  speaker_id_enabled BOOLEAN DEFAULT true,
  azure_conversation_id TEXT,
  blob_storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting Participants (links users to meetings)
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  speaker_profile_id UUID REFERENCES speaker_profiles(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  is_host BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- RLS for meetings
CREATE POLICY "meetings_select_own" ON meetings FOR SELECT
  TO authenticated USING (
    created_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM meeting_participants WHERE meeting_id = meetings.id AND user_id = auth.uid())
  );

CREATE POLICY "meetings_select_admin" ON meetings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "meetings_insert" ON meetings FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "meetings_update_own" ON meetings FOR UPDATE
  TO authenticated USING (created_by = auth.uid());

CREATE POLICY "meetings_delete_own" ON meetings FOR DELETE
  TO authenticated USING (created_by = auth.uid());

-- RLS for meeting_participants
CREATE POLICY "meeting_participants_select" ON meeting_participants FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.created_by = auth.uid() OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())))
  );

CREATE POLICY "meeting_participants_insert" ON meeting_participants FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

-- Indexes
CREATE INDEX idx_meetings_created_by ON meetings(created_by);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_started_at ON meetings(started_at);
CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user ON meeting_participants(user_id);

-- Triggers
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();