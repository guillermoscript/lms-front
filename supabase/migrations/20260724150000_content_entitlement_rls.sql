-- Issue #509 — make the database the backstop for course-content access.
--
-- The `authenticated` SELECT policies on lessons/exercises/exams were pure
-- tenant checks (`tenant_id = get_tenant_id()`), so any member of a tenant
-- could read every lesson body, exercise config and exam in that tenant by
-- URL, entitlement or not — and the #494 `access_cutoff_at` enforcement,
-- which lives inside `has_course_access()`, never applied to content at all.
--
-- These policies are REPLACED rather than supplemented: permissive policies
-- OR together, so an added policy could only ever widen access.
--
-- Shape copied from `lesson_resources_select`
-- (20260516150000_phase3_drop_legacy_enrollment_columns.sql): tenant match
-- AND (staff OR course author OR has_course_access). Each branch is written
-- to be row-independent where possible so Postgres evaluates it once per
-- statement as an InitPlan rather than once per row.
--
-- Explicitly NOT touched: the anon "Anon can view preview lessons" policy
-- (#426) and the anon column grants it depends on, and the existing
-- super-admin SELECT policies. Public pages read content through the service
-- role client and are unaffected either way.

-- Staff escape hatch. Teachers and admins hold no entitlement for the courses
-- they author, and the whole teacher authoring surface (plus every MCP server
-- tool) reads these tables through an RLS-bound user client — without this
-- branch the course editor renders empty.
--
-- Reads `tenant_users` rather than the JWT's `tenant_role` claim because
-- `tenant_users` is authoritative (see CLAUDE.md); SECURITY DEFINER so it
-- neither recurses into `tenant_users` RLS nor needs a policy of its own.
CREATE OR REPLACE FUNCTION public.is_tenant_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.tenant_id = get_tenant_id()
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND tu.role::text IN ('teacher', 'admin')
  );
$function$;

COMMENT ON FUNCTION public.is_tenant_staff() IS
  'True when the caller is an active teacher or admin of the tenant in their JWT. Used by content RLS policies to let staff read courses they hold no entitlement for.';

-- Functions in `public` carry a default PUBLIC execute grant, which would
-- expose this over PostgREST to `anon` too. It only ever reports on the
-- caller (false for anon), but least privilege keeps it off the REST surface.
REVOKE EXECUTE ON FUNCTION public.is_tenant_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff() TO authenticated;

-- lessons ---------------------------------------------------------------
-- `is_preview` lessons stay readable to any signed-in tenant member: they are
-- already public to logged-out visitors via the anon policy, and a logged-in
-- prospective buyer must not see less than an anonymous one.
-- `course_id` is bigint here and the function takes integer, hence the cast.
DROP POLICY IF EXISTS "Users can view tenant lessons" ON public.lessons;
CREATE POLICY "Users can view tenant lessons"
  ON public.lessons FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR (is_preview = true AND status = 'published')
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = lessons.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR public.has_course_access((SELECT auth.uid()), lessons.course_id::integer)
    )
  );

-- exercises -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view tenant exercises" ON public.exercises;
CREATE POLICY "Users can view tenant exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = exercises.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR public.has_course_access((SELECT auth.uid()), exercises.course_id)
    )
  );

-- exams -----------------------------------------------------------------
DROP POLICY IF EXISTS "Students can view tenant exams" ON public.exams;
CREATE POLICY "Students can view tenant exams"
  ON public.exams FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = exams.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR public.has_course_access((SELECT auth.uid()), exams.course_id)
    )
  );

-- Supporting indexes for the author branch and the entitlement lookup.
CREATE INDEX IF NOT EXISTS idx_courses_author_id ON public.courses (author_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user_course_status
  ON public.entitlements (user_id, course_id, status);

-- Metadata counts for the catalog, which must stay honest for courses the
-- caller has not bought. `lms_browse_catalog` (mcp-server) reads through an
-- RLS-bound user client and would otherwise report 0 lessons for every course
-- a student has not yet enrolled in.
CREATE OR REPLACE FUNCTION public.get_published_lesson_counts(_course_ids integer[])
RETURNS TABLE (course_id integer, lesson_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.course_id::integer, count(*)
  FROM lessons l
  JOIN courses c ON c.course_id = l.course_id
  WHERE l.course_id = ANY(_course_ids)
    AND l.status = 'published'
    AND c.status = 'published'
    AND l.tenant_id = get_tenant_id()
  GROUP BY l.course_id;
$function$;

COMMENT ON FUNCTION public.get_published_lesson_counts(integer[]) IS
  'Published-lesson counts for catalog listings. SECURITY DEFINER so a prospective buyer sees a real count for courses whose lesson rows content RLS hides from them (#509). Returns counts only — never lesson content.';

-- Authenticated only: the public catalog pages read lesson metadata through
-- the service-role client, so anon never needs this.
REVOKE EXECUTE ON FUNCTION public.get_published_lesson_counts(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_published_lesson_counts(integer[]) TO authenticated;
