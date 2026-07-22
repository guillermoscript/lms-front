-- #426: free-lesson preview for prospective students.
-- Adds lessons.is_preview and tightens anon read access to lessons.
--
-- The previous anon policy ("Anon can view tenant lessons",
-- 20260405000000_fix_public_courses_page.sql) granted anon SELECT on every
-- lesson row of the tenant — including content — despite its comment
-- claiming published-course scoping. Public pages now fetch curriculum
-- metadata server-side (admin client, explicit filters), so anon PostgREST
-- access can be narrowed to exactly what is meant to be public: published
-- preview lessons of published courses in the current tenant.

ALTER TABLE public.lessons
  ADD COLUMN is_preview boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lessons.is_preview IS
  'Free preview: lesson is viewable by anyone (including logged-out visitors) on the public course page.';

DROP POLICY IF EXISTS "Anon can view tenant lessons" ON public.lessons;

CREATE POLICY "Anon can view preview lessons" ON public.lessons
  FOR SELECT TO anon
  USING (
    is_preview = true
    AND status = 'published'
    AND tenant_id = (SELECT public.get_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.course_id = lessons.course_id
        AND c.status = 'published'
        AND c.tenant_id = lessons.tenant_id
    )
  );

-- Column-level hardening: the policy above grants ROW access, but RLS cannot
-- mask columns — without this, anon could still read ai_task_instructions
-- (teacher grading criteria, which may contain answers) on preview lessons.
-- Caveat: with column grants, anon `select=*` on lessons errors. All public
-- pages fetch lessons via the admin client and no anon path selects *.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.lessons FROM anon;
GRANT SELECT (
  id, course_id, tenant_id, title, description, summary, sequence,
  content, video_url, embed_code, image, status, is_preview, publish_at,
  created_at, updated_at
) ON public.lessons TO anon;
