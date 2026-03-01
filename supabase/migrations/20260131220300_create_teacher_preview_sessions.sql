-- Create preview sessions table for testing AI behavior
CREATE TABLE teacher_preview_sessions (
  id BIGSERIAL PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'lesson', 'exercise', 'exam'
  entity_id BIGINT,
  test_config JSONB NOT NULL, -- Stores the prompts being tested
  messages JSONB[], -- Chat history for preview
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE teacher_preview_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Teachers manage their own previews" ON teacher_preview_sessions
  FOR ALL USING (teacher_id = auth.uid());

-- Auto-cleanup old sessions (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_preview_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM teacher_preview_sessions
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
