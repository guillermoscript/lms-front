-- Lesson Resources, Sequential Prerequisites & Scheduling
-- 1a. lesson_resources table
CREATE TABLE lesson_resources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_resources_lesson ON lesson_resources(lesson_id);
CREATE INDEX idx_lesson_resources_tenant ON lesson_resources(tenant_id);

-- RLS
ALTER TABLE lesson_resources ENABLE ROW LEVEL SECURITY;

-- SELECT: enrolled students OR course author/admin
CREATE POLICY "lesson_resources_select" ON lesson_resources FOR SELECT USING (
  tenant_id = (
    SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
  )
  AND (
    -- Course author
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN courses c ON c.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND c.author_id = auth.uid()
    )
    OR
    -- Tenant admin
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = lesson_resources.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
    OR
    -- Enrolled student (via product_courses → products → enrollments)
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN product_courses pc ON pc.course_id = l.course_id
      JOIN enrollments e ON e.product_id = pc.product_id
      WHERE l.id = lesson_resources.lesson_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  )
);

-- INSERT: course author or admin
CREATE POLICY "lesson_resources_insert" ON lesson_resources FOR INSERT WITH CHECK (
  tenant_id = (
    SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
  )
  AND (
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN courses c ON c.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND c.author_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = lesson_resources.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
  )
);

-- UPDATE: course author or admin
CREATE POLICY "lesson_resources_update" ON lesson_resources FOR UPDATE USING (
  tenant_id = (
    SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
  )
  AND (
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN courses c ON c.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND c.author_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = lesson_resources.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
  )
);

-- DELETE: course author or admin
CREATE POLICY "lesson_resources_delete" ON lesson_resources FOR DELETE USING (
  tenant_id = (
    SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
  )
  AND (
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN courses c ON c.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND c.author_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = lesson_resources.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
  )
);

-- 1b. Sequential completion flag on courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS require_sequential_completion BOOLEAN NOT NULL DEFAULT false;

-- 1c. Lesson scheduling
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

-- 1d. Auto-publish cron function
CREATE OR REPLACE FUNCTION publish_scheduled_lessons()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE lessons
  SET status = 'published', updated_at = now()
  WHERE publish_at <= now()
    AND status = 'draft'
    AND publish_at IS NOT NULL;
END;
$$;

-- Schedule via pg_cron every 5 minutes (requires pg_cron extension)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('publish-scheduled-lessons', '*/5 * * * *', $$SELECT publish_scheduled_lessons()$$);
  END IF;
END
$$;

-- 1e. Storage bucket for lesson resources
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-resources',
  'lesson-resources',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
) ON CONFLICT (id) DO NOTHING;
