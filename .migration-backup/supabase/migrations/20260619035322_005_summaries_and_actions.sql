-- Meeting Summaries (AI-generated)
CREATE TABLE meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  summary TEXT NOT NULL,
  key_topics TEXT[],
  decisions TEXT[],
  action_items JSONB DEFAULT '[]'::jsonb,
  sentiment TEXT,
  participant_insights JSONB,
  processing_time_seconds FLOAT,
  tokens_used INT,
  model_used TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action Items (extracted from meetings)
CREATE TABLE action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  summary_id UUID REFERENCES meeting_summaries(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- RLS for meeting_summaries
CREATE POLICY "meeting_summaries_select" ON meeting_summaries FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.created_by = auth.uid() OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())))
  );

CREATE POLICY "meeting_summaries_insert" ON meeting_summaries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

CREATE POLICY "meeting_summaries_update" ON meeting_summaries FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

-- RLS for action_items
CREATE POLICY "action_items_select_own" ON action_items FOR SELECT
  TO authenticated USING (
    assigned_to = auth.uid() OR meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

CREATE POLICY "action_items_select_admin" ON action_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "action_items_insert" ON action_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

CREATE POLICY "action_items_update_own" ON action_items FOR UPDATE
  TO authenticated USING (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY "action_items_delete" ON action_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE id = meeting_id AND created_by = auth.uid())
  );

-- Indexes
CREATE INDEX idx_meeting_summaries_meeting ON meeting_summaries(meeting_id);
CREATE INDEX idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX idx_action_items_assigned ON action_items(assigned_to);
CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_action_items_due_date ON action_items(due_date);

-- Triggers
CREATE TRIGGER meeting_summaries_updated_at
  BEFORE UPDATE ON meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();