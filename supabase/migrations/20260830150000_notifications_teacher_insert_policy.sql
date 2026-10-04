-- Straggler from the #650 sweep: the teacher INSERT policy on notifications
-- still required a GLOBAL user_roles 'teacher' row, so a real tenant teacher
-- (global role 'student') could not create notifications for their own
-- courses. Authorship of the target course is the real authority here — the
-- global-role branch added nothing but the silent denial — plus the tenant
-- predicate every other notifications policy already carries.
DROP POLICY IF EXISTS "Teachers can create course notifications" ON public.notifications;
CREATE POLICY "Teachers can create course notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT get_tenant_id())
    AND target_type = 'course'
    AND target_course_id IN (SELECT c.course_id FROM courses c WHERE c.author_id = (SELECT auth.uid()))
  );
