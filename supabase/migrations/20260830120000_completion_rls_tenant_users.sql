-- Teacher/admin reads of lesson_completions and exercise_completions must be
-- authorised by tenant_users, not by the global user_roles table (#649).
--
-- WHY
--   The Students tab (#647) showed 0 % / "No activity yet" for every student
--   of a production course that had 8 lesson completions. The teacher-facing
--   SELECT policy on lesson_completions was
--
--     EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
--                                        AND role IN ('teacher','admin'))
--
--   `user_roles` is the GLOBAL role — the course author is a tenant admin in
--   `tenant_users` (the authoritative table, see CLAUDE.md) but 'student' in
--   `user_roles`, so the policy matched nothing and RLS returned zero rows
--   without an error. Nothing upstream could tell "no rows" from "no access".
--
--   exercise_completions had the opposite defect: `get_tenant_role() IN
--   ('teacher','admin')` with no tenant predicate at all, so any teacher in
--   any tenant could read every school's completions (the table has no
--   tenant_id, so the check has to go through exercises.tenant_id).
--
-- WHAT
--   Both teacher policies now resolve the row's tenant through its parent
--   (lessons.tenant_id / exercises.tenant_id) and require an ACTIVE
--   teacher/admin membership in that tenant — the same shape
--   `teachers_view_tenant_evaluations` and
--   `lesson_checkpoint_attempts_teachers_read_tenant` already use, which is
--   why the analytics page worked while this tab did not.
--
--   Student self-access policies are untouched.

DROP POLICY IF EXISTS "Teachers and admins view all completions" ON public.lesson_completions;

CREATE POLICY "Teachers and admins view tenant completions"
  ON public.lesson_completions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.tenant_users tu ON tu.tenant_id = l.tenant_id
      WHERE l.id = lesson_completions.lesson_id
        AND tu.user_id = (SELECT auth.uid())
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Teachers and admins can view all exercise completions" ON public.exercise_completions;

CREATE POLICY "Teachers and admins view tenant exercise completions"
  ON public.exercise_completions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercises x
      JOIN public.tenant_users tu ON tu.tenant_id = x.tenant_id
      WHERE x.id = exercise_completions.exercise_id
        AND tu.user_id = (SELECT auth.uid())
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
  );

-- The policy subqueries hit these on every row.
CREATE INDEX IF NOT EXISTS idx_lesson_completions_lesson_id ON public.lesson_completions (lesson_id);
CREATE INDEX IF NOT EXISTS idx_exercise_completions_exercise_id ON public.exercise_completions (exercise_id);
