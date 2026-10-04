-- A teacher/admin needs to read a student's lesson-tutor conversation to
-- audit why `markLessonCompleted` was granted (#805, follow-up to #804).
--
-- `lessons_ai_task_messages` has no `tenant_id` column (CLAUDE.md); its only
-- policy is `FOR ALL USING (auth.uid() = user_id)`, so today a teacher gets
-- zero rows back — indistinguishable from "no conversation happened".
--
-- This adds a second, permissive SELECT policy scoped through the row's
-- lesson (lessons.tenant_id), modeled on "Teachers and admins view tenant
-- completions" on lesson_completions (20260830120000_completion_rls_tenant_users.sql):
-- tenant_users is the authoritative role source, never the global user_roles
-- table (#649) — a course author is a tenant admin in tenant_users but
-- 'student' in user_roles, so a user_roles-shaped check here would silently
-- match nothing. The existing owner policy is untouched, so writes (insert/
-- update/delete) stay student-only.

CREATE POLICY "Teachers and admins view tenant ai task messages"
  ON public.lessons_ai_task_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.tenant_users tu ON tu.tenant_id = l.tenant_id
      WHERE l.id = lessons_ai_task_messages.lesson_id
        AND tu.user_id = (SELECT auth.uid())
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
  );

-- The policy subquery hits this on every row.
CREATE INDEX IF NOT EXISTS idx_lessons_ai_task_messages_lesson_id ON public.lessons_ai_task_messages (lesson_id);
