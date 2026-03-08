-- Add voice/audio exercise types to the exercise_type enum
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'audio_evaluation';
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'video_evaluation';
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'real_time_conversation';

-- Add exercise_config column to exercises table for type-specific configuration
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_config jsonb DEFAULT '{}';

-- Table for audio/video media submissions
CREATE TABLE IF NOT EXISTS exercise_media_submissions (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  exercise_id     bigint NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id         uuid   NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id       uuid   NOT NULL,
  media_url       text   NOT NULL,
  media_type      text   NOT NULL CHECK (media_type IN ('audio', 'video')),
  duration_seconds integer,
  status          text   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  stt_result      jsonb,
  ai_evaluation   jsonb,
  score           numeric(5,2),
  created_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS exercise_media_submissions_exercise_user
  ON exercise_media_submissions(exercise_id, user_id);
CREATE INDEX IF NOT EXISTS exercise_media_submissions_tenant
  ON exercise_media_submissions(tenant_id);

-- RLS
ALTER TABLE exercise_media_submissions ENABLE ROW LEVEL SECURITY;

-- Students see only their own submissions within their tenant
CREATE POLICY "students_own_media_submissions" ON exercise_media_submissions
  FOR ALL
  USING (
    user_id = auth.uid()
    AND tenant_id = (current_setting('request.headers', true)::jsonb->>'x-tenant-id')::uuid
  );

-- Teachers/admins can view all submissions in their tenant
CREATE POLICY "teachers_view_tenant_media_submissions" ON exercise_media_submissions
  FOR SELECT
  USING (
    tenant_id = (current_setting('request.headers', true)::jsonb->>'x-tenant-id')::uuid
  );
