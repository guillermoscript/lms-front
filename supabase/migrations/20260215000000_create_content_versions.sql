-- Create content_versions table for version history of lessons, exams, exercises, and prompt templates
CREATE TABLE public.content_versions (
  id BIGSERIAL PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('lesson', 'exam', 'exercise', 'prompt_template')),
  content_id BIGINT NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id, version_number)
);

-- Index for fast version lookups (most recent first)
CREATE INDEX idx_content_versions_lookup
  ON public.content_versions (content_type, content_id, version_number DESC);

-- Index for RLS filtering by user
CREATE INDEX idx_content_versions_changed_by
  ON public.content_versions (changed_by);

-- Enable RLS
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;

-- Teachers can see versions they created
CREATE POLICY "Teachers see own versions"
  ON public.content_versions FOR SELECT
  USING (changed_by = auth.uid());

-- Admins can see all versions
CREATE POLICY "Admins see all versions"
  ON public.content_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow inserts where changed_by matches current user (used by triggers via SECURITY DEFINER)
CREATE POLICY "Insert own versions"
  ON public.content_versions FOR INSERT
  WITH CHECK (changed_by = auth.uid());

-- No UPDATE or DELETE policies — versions are immutable
