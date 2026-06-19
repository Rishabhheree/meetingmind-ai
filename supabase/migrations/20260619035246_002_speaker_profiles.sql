-- Speaker Profiles for voice recognition
CREATE TABLE speaker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  azure_profile_id TEXT UNIQUE,
  enrollment_status TEXT DEFAULT 'pending' CHECK (enrollment_status IN ('pending', 'enrolling', 'enrolled', 'failed')),
  confidence FLOAT DEFAULT 0,
  enrollment_count INT DEFAULT 0,
  last_enrollment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Voice Enrollments (individual enrollment sessions)
CREATE TABLE voice_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  speaker_profile_id UUID REFERENCES speaker_profiles(id) ON DELETE SET NULL,
  audio_blob_url TEXT,
  duration_seconds FLOAT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  azure_audio_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE speaker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS for speaker_profiles
CREATE POLICY "speaker_profiles_select_own" ON speaker_profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "speaker_profiles_select_admin" ON speaker_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "speaker_profiles_insert" ON speaker_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "speaker_profiles_update_own" ON speaker_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "speaker_profiles_delete_own" ON speaker_profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS for voice_enrollments
CREATE POLICY "voice_enrollments_select_own" ON voice_enrollments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "voice_enrollments_select_admin" ON voice_enrollments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "voice_enrollments_insert" ON voice_enrollments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_enrollments_delete_own" ON voice_enrollments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_speaker_profiles_user ON speaker_profiles(user_id);
CREATE INDEX idx_voice_enrollments_user ON voice_enrollments(user_id);
CREATE INDEX idx_voice_enrollments_status ON voice_enrollments(status);

-- Triggers
CREATE TRIGGER speaker_profiles_updated_at
  BEFORE UPDATE ON speaker_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();