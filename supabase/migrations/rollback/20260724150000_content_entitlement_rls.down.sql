-- Rollback for 20260724150000_content_entitlement_rls.sql (#509).
--
-- Restores the pre-#509 tenant-only SELECT policies on lessons/exercises/exams
-- exactly as written in 20260313151603 / 20260313151854. Reverting reopens the
-- paywall bypass and makes the #494 access cutoff a no-op for content again —
-- only run this to unblock an incident.

DROP POLICY IF EXISTS "Users can view tenant lessons" ON public.lessons;
CREATE POLICY "Users can view tenant lessons"
  ON public.lessons FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "Users can view tenant exercises" ON public.exercises;
CREATE POLICY "Users can view tenant exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "Students can view tenant exams" ON public.exams;
CREATE POLICY "Students can view tenant exams"
  ON public.exams FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

DROP FUNCTION IF EXISTS public.get_published_lesson_counts(integer[]);

-- is_tenant_staff() is left in place: dropping it would break any later
-- migration that adopted it, and it grants nothing on its own.
