-- RLS sweep (#650): staff access must be authorised by tenant_users, scoped to
-- the row's own tenant — never by the global user_roles table, and never by a
-- bare role check with no tenant predicate.
--
-- WHY (two defect classes, both proven in production by #649)
--   1. `EXISTS (... FROM user_roles WHERE role IN ('teacher','admin'))`
--      user_roles is the GLOBAL role. A tenant admin whose global role is
--      'student' (the normal case for self-served school owners) matches
--      nothing → RLS silently returns zero rows, which reads as "no data".
--      Conversely, anyone with a global staff role passes the check in EVERY
--      tenant.
--   2. `get_tenant_role() IN ('teacher','admin')` with no tenant predicate on
--      tables that carry no tenant_id: staff of ANY tenant read EVERY
--      tenant's rows (cross-tenant leak).
--
-- HOW
--   Two SECURITY DEFINER helpers (shape of the existing `is_tenant_staff()`,
--   which stays for JWT-tenant-scoped content policies), taking the ROW's
--   tenant as an argument so the check is per-row, not per-JWT:
--     is_staff_of(tenant)  — active teacher/admin membership in that tenant
--     is_admin_of(tenant)  — active admin membership in that tenant
--   plus `manages_user(user)` for user-parented tables with no tenant at all
--   (chats, tickets): true when the caller is an active admin of a tenant the
--   target user is an active member of.
--
--   Rows are tied to their tenant through their own tenant_id or their parent
--   (lesson → lessons.tenant_id, exercise → exercises.tenant_id, …). Note the
--   parent subqueries run under the caller's RLS: staff can read their own
--   tenant's lessons/exercises/exams/courses, which is exactly the visibility
--   these policies need.
--
--   Platform-global tables with no tenant to scope to go to is_super_admin()
--   (system_settings, mcp_audit_log, issuer_keys management). issuer_keys
--   SELECT stays readable to active tenant staff because the certificate
--   issue flow (lib/certificates/issue-certificate.ts) reads signing keys
--   through the user-scoped client.
--
--   Every table touched here was verified empty in production on 2026-08-30
--   except notification_templates (4 rows, all tenant_id NULL — treated as
--   platform-shared: readable by any active staff, managed by super admins;
--   tenant-owned rows are managed by that tenant's admins).
--
-- Deliberately NOT touched (noted in #650): permissive `qual=true` SELECT
-- policies on assignments/exercise_files/messages — legacy surface, empty in
-- prod, tightening them is a behaviour change beyond staff scoping.

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_staff_of(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.tenant_id = _tenant
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND tu.role::text IN ('teacher', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.tenant_id = _tenant
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND tu.role::text = 'admin'
  );
$$;

-- Admin oversight of user-parented rows (chats, tickets): the caller must be
-- an active admin of some tenant the target user is an active member of.
CREATE OR REPLACE FUNCTION public.manages_user(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_users me
    JOIN tenant_users them ON them.tenant_id = me.tenant_id
    WHERE me.user_id = auth.uid()
      AND me.role::text = 'admin'
      AND me.status = 'active'
      AND them.user_id = _user
      AND them.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_staff_of(uuid) IS 'Active teacher/admin membership in the given tenant (tenant_users is authoritative). Row-scoped counterpart of is_tenant_staff().';
COMMENT ON FUNCTION public.is_admin_of(uuid) IS 'Active admin membership in the given tenant (tenant_users is authoritative).';
COMMENT ON FUNCTION public.manages_user(uuid) IS 'Caller is an active admin of a tenant the given user is an active member of. For staff oversight of tables parented only by a user (chats, tickets).';

REVOKE EXECUTE ON FUNCTION public.is_staff_of(uuid), public.is_admin_of(uuid), public.manages_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_of(uuid), public.is_admin_of(uuid), public.manages_user(uuid) TO authenticated;

-- ── Class 1: user_roles-based policies ──────────────────────────────────────

-- certificates (has tenant_id). The author branch stays: course authors keep
-- their certificates regardless of membership role.
DROP POLICY IF EXISTS "Teachers can view certificates for their courses" ON public.certificates;
CREATE POLICY "Teachers can view certificates for their courses"
  ON public.certificates FOR SELECT TO authenticated
  USING (
    is_staff_of(tenant_id)
    OR EXISTS (SELECT 1 FROM courses c WHERE c.course_id = certificates.course_id AND c.author_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Teachers can revoke certificates" ON public.certificates;
CREATE POLICY "Teachers can revoke certificates"
  ON public.certificates FOR UPDATE TO authenticated
  USING (
    is_staff_of(tenant_id)
    OR EXISTS (SELECT 1 FROM courses c WHERE c.course_id = certificates.course_id AND c.author_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Students, teachers, admins, or course authors can insert certif" ON public.certificates;
CREATE POLICY "Students, staff, or course authors can insert certificates"
  ON public.certificates FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR is_staff_of(tenant_id)
    OR EXISTS (SELECT 1 FROM courses c WHERE c.course_id = certificates.course_id AND c.author_id = (SELECT auth.uid()))
  );

-- certificate_verification_log (no tenant_id; certificate_id → certificates).
DROP POLICY IF EXISTS "Only admins can view verification logs" ON public.certificate_verification_log;
CREATE POLICY "Tenant admins can view verification logs"
  ON public.certificate_verification_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certificates c
      WHERE c.certificate_id = certificate_verification_log.certificate_id
        AND is_admin_of(c.tenant_id)
    )
  );

-- comments (lesson comments, no tenant_id; lesson_id → lessons).
DROP POLICY IF EXISTS "Teachers and admins can view all comments" ON public.comments;
CREATE POLICY "Tenant staff can view tenant comments"
  ON public.comments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM lessons l WHERE l.id = comments.lesson_id AND is_staff_of(l.tenant_id))
  );

-- content_versions (polymorphic content_type in exam|exercise|lesson).
-- Teachers keep "own versions"; tenant staff see versions of their tenant's
-- content; super admins keep the platform view.
DROP POLICY IF EXISTS "Admins see all versions" ON public.content_versions;
CREATE POLICY "Tenant staff see tenant content versions"
  ON public.content_versions FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (content_type = 'lesson' AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = content_versions.content_id AND is_staff_of(l.tenant_id)))
    OR (content_type = 'exercise' AND EXISTS (SELECT 1 FROM exercises x WHERE x.id = content_versions.content_id AND is_staff_of(x.tenant_id)))
    OR (content_type = 'exam' AND EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = content_versions.content_id AND is_staff_of(e.tenant_id)))
  );

-- exam_ai_configs (exam_id → exams). Author policy stays alongside.
DROP POLICY IF EXISTS "Admins can manage all AI configs" ON public.exam_ai_configs;
CREATE POLICY "Tenant admins can manage tenant AI configs"
  ON public.exam_ai_configs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_ai_configs.exam_id AND is_admin_of(e.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_ai_configs.exam_id AND is_admin_of(e.tenant_id)));

-- exam_question_scores (submission_id → exam_submissions carries tenant_id).
DROP POLICY IF EXISTS "Admins can manage all exam question scores" ON public.exam_question_scores;
CREATE POLICY "Tenant admins can manage tenant exam question scores"
  ON public.exam_question_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_submissions es WHERE es.submission_id = exam_question_scores.submission_id AND is_admin_of(es.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM exam_submissions es WHERE es.submission_id = exam_question_scores.submission_id AND is_admin_of(es.tenant_id)));

-- issuer_keys (platform-global signing keys, no tenant_id). The issue flow
-- reads keys as the signed-in teacher, so SELECT goes to active staff of the
-- caller's JWT tenant; management is platform-level only.
DROP POLICY IF EXISTS "Only admins can view issuer keys" ON public.issuer_keys;
CREATE POLICY "Tenant staff can view issuer keys"
  ON public.issuer_keys FOR SELECT TO authenticated
  USING ((SELECT is_tenant_staff()) OR (SELECT is_super_admin()));
DROP POLICY IF EXISTS "Only admins can manage issuer keys" ON public.issuer_keys;
CREATE POLICY "Super admins can manage issuer keys"
  ON public.issuer_keys FOR ALL TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

-- mcp_audit_log (platform-global; per-user policy already exists).
DROP POLICY IF EXISTS "Admins view all audit logs" ON public.mcp_audit_log;
CREATE POLICY "Super admins view all audit logs"
  ON public.mcp_audit_log FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

-- notification_templates (has tenant_id; existing rows are NULL = shared
-- platform templates readable by any active staff, managed by super admins).
DROP POLICY IF EXISTS "Admins and teachers can view templates" ON public.notification_templates;
CREATE POLICY "Tenant staff can view templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (
    (tenant_id IS NULL AND (SELECT is_tenant_staff()))
    OR (tenant_id IS NOT NULL AND is_staff_of(tenant_id))
    OR (SELECT is_super_admin())
  );
DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
CREATE POLICY "Tenant admins can manage tenant templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING ((tenant_id IS NOT NULL AND is_admin_of(tenant_id)) OR (SELECT is_super_admin()))
  WITH CHECK ((tenant_id IS NOT NULL AND is_admin_of(tenant_id)) OR (SELECT is_super_admin()));

-- notifications: tenant-scoped INSERT/UPDATE/DELETE/SELECT policies already
-- exist; the two user_roles-based blanket policies are pure cross-tenant
-- escape hatches. A tenant-scoped DELETE-capable admin path remains, and
-- "Users can view tenant notifications" already covers admins' reads.
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;

-- system_settings (platform-global).
DROP POLICY IF EXISTS "Admins can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can delete settings" ON public.system_settings;
CREATE POLICY "Super admins can read settings" ON public.system_settings FOR SELECT TO authenticated USING ((SELECT is_super_admin()));
CREATE POLICY "Super admins can insert settings" ON public.system_settings FOR INSERT TO authenticated WITH CHECK ((SELECT is_super_admin()));
CREATE POLICY "Super admins can update settings" ON public.system_settings FOR UPDATE TO authenticated USING ((SELECT is_super_admin()));
CREATE POLICY "Super admins can delete settings" ON public.system_settings FOR DELETE TO authenticated USING ((SELECT is_super_admin()));

-- user_notifications (notification_id → notifications carries tenant_id).
DROP POLICY IF EXISTS "Admins can manage user notifications" ON public.user_notifications;
CREATE POLICY "Tenant admins can manage tenant user notifications"
  ON public.user_notifications FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM notifications n WHERE n.id = user_notifications.notification_id AND is_admin_of(n.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM notifications n WHERE n.id = user_notifications.notification_id AND is_admin_of(n.tenant_id)));

-- ── Class 2: role checks with no tenant predicate ───────────────────────────

-- assignments (course_id → courses).
DROP POLICY IF EXISTS "Teachers and admins can manage assignments" ON public.assignments;
CREATE POLICY "Tenant staff can manage tenant assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.course_id = assignments.course_id AND is_staff_of(c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM courses c WHERE c.course_id = assignments.course_id AND is_staff_of(c.tenant_id)));

-- chats (user-parented only).
DROP POLICY IF EXISTS "Admins can view all chats" ON public.chats;
CREATE POLICY "Tenant admins can view their members' chats"
  ON public.chats FOR SELECT TO authenticated
  USING (manages_user(user_id));

-- messages (chat_id → chats → user).
DROP POLICY IF EXISTS "Admins can manage messages" ON public.messages;
CREATE POLICY "Tenant admins can manage their members' messages"
  ON public.messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = messages.chat_id AND manages_user(c.user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = messages.chat_id AND manages_user(c.user_id)));

-- comment_flags (comment_id → comments → lessons).
DROP POLICY IF EXISTS "Admins can view all comment flags" ON public.comment_flags;
CREATE POLICY "Tenant admins can view tenant comment flags"
  ON public.comment_flags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM comments cm JOIN lessons l ON l.id = cm.lesson_id WHERE cm.comment_id = comment_flags.comment_id AND is_admin_of(l.tenant_id)));
DROP POLICY IF EXISTS "Admins can delete comment flags" ON public.comment_flags;
CREATE POLICY "Tenant admins can delete tenant comment flags"
  ON public.comment_flags FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM comments cm JOIN lessons l ON l.id = cm.lesson_id WHERE cm.comment_id = comment_flags.comment_id AND is_admin_of(l.tenant_id)));

-- exam_answers (submission_id → exam_submissions).
DROP POLICY IF EXISTS "Teachers and admins can update exam answers" ON public.exam_answers;
CREATE POLICY "Tenant staff can update tenant exam answers"
  ON public.exam_answers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_submissions s WHERE s.submission_id = exam_answers.submission_id AND is_staff_of(s.tenant_id)));

-- exam_scores (exam_id → exams).
DROP POLICY IF EXISTS "Teachers and admins can view all exam scores" ON public.exam_scores;
CREATE POLICY "Tenant staff can view tenant exam scores"
  ON public.exam_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_scores.exam_id AND is_staff_of(e.tenant_id)));
DROP POLICY IF EXISTS "Teachers and admins can manage exam scores" ON public.exam_scores;
CREATE POLICY "Tenant staff can manage tenant exam scores"
  ON public.exam_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_scores.exam_id AND is_staff_of(e.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_scores.exam_id AND is_staff_of(e.tenant_id)));

-- exam_views (exam_id → exams).
DROP POLICY IF EXISTS "Teachers and admins can view all exam views" ON public.exam_views;
CREATE POLICY "Tenant staff can view tenant exam views"
  ON public.exam_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.exam_id = exam_views.exam_id AND is_staff_of(e.tenant_id)));

-- exercise_code_student_submissions / exercise_files / exercise_messages
-- (exercise_id → exercises).
DROP POLICY IF EXISTS "Teachers and admins can view all code submissions" ON public.exercise_code_student_submissions;
CREATE POLICY "Tenant staff can view tenant code submissions"
  ON public.exercise_code_student_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exercises x WHERE x.id = exercise_code_student_submissions.exercise_id AND is_staff_of(x.tenant_id)));

DROP POLICY IF EXISTS "Teachers and admins can manage exercise files" ON public.exercise_files;
CREATE POLICY "Tenant staff can manage tenant exercise files"
  ON public.exercise_files FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exercises x WHERE x.id = exercise_files.exercise_id AND is_staff_of(x.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM exercises x WHERE x.id = exercise_files.exercise_id AND is_staff_of(x.tenant_id)));

DROP POLICY IF EXISTS "Teachers and admins can view all exercise messages" ON public.exercise_messages;
CREATE POLICY "Tenant staff can view tenant exercise messages"
  ON public.exercise_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exercises x WHERE x.id = exercise_messages.exercise_id AND is_staff_of(x.tenant_id)));

-- grades (course_id → courses).
DROP POLICY IF EXISTS "Teachers and admins can view all grades" ON public.grades;
CREATE POLICY "Tenant staff can view tenant grades"
  ON public.grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.course_id = grades.course_id AND is_staff_of(c.tenant_id)));
DROP POLICY IF EXISTS "Teachers and admins can manage grades" ON public.grades;
CREATE POLICY "Tenant staff can manage tenant grades"
  ON public.grades FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.course_id = grades.course_id AND is_staff_of(c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM courses c WHERE c.course_id = grades.course_id AND is_staff_of(c.tenant_id)));

-- lesson_passed / lesson_views (lesson_id → lessons).
DROP POLICY IF EXISTS "Teachers and admins can view all lesson passed" ON public.lesson_passed;
CREATE POLICY "Tenant staff can view tenant lesson passed"
  ON public.lesson_passed FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_passed.lesson_id AND is_staff_of(l.tenant_id)));

DROP POLICY IF EXISTS "Teachers and admins can view all lesson views" ON public.lesson_views;
CREATE POLICY "Tenant staff can view tenant lesson views"
  ON public.lesson_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_views.lesson_id AND is_staff_of(l.tenant_id)));

-- lesson_comments admin DELETE (lesson_id → lessons).
DROP POLICY IF EXISTS "Admins can delete any lesson comment" ON public.lesson_comments;
CREATE POLICY "Tenant admins can delete tenant lesson comments"
  ON public.lesson_comments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_comments.lesson_id AND is_admin_of(l.tenant_id)));

-- plan_courses (plan_id → plans).
DROP POLICY IF EXISTS "Admins can manage plan courses" ON public.plan_courses;
CREATE POLICY "Tenant admins can manage tenant plan courses"
  ON public.plan_courses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM plans p WHERE p.plan_id = plan_courses.plan_id AND is_admin_of(p.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM plans p WHERE p.plan_id = plan_courses.plan_id AND is_admin_of(p.tenant_id)));

-- submissions (assignment_id → assignments → courses).
DROP POLICY IF EXISTS "Teachers and admins can view all submissions" ON public.submissions;
CREATE POLICY "Tenant staff can view tenant submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a JOIN courses c ON c.course_id = a.course_id WHERE a.assignment_id = submissions.assignment_id AND is_staff_of(c.tenant_id)));
DROP POLICY IF EXISTS "Teachers and admins can update submissions" ON public.submissions;
CREATE POLICY "Tenant staff can update tenant submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a JOIN courses c ON c.course_id = a.course_id WHERE a.assignment_id = submissions.assignment_id AND is_staff_of(c.tenant_id)));

-- tickets / ticket_messages (user-parented only).
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.tickets;
CREATE POLICY "Tenant admins can view their members' tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (manages_user(user_id));
DROP POLICY IF EXISTS "Admins can update all tickets" ON public.tickets;
CREATE POLICY "Tenant admins can update their members' tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (manages_user(user_id));
DROP POLICY IF EXISTS "Admins can view all ticket messages" ON public.ticket_messages;
CREATE POLICY "Tenant admins can view their members' ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM tickets t WHERE t.ticket_id = ticket_messages.ticket_id AND manages_user(t.user_id)));
DROP POLICY IF EXISTS "Admins can create ticket messages" ON public.ticket_messages;
CREATE POLICY "Tenant admins can reply to their members' tickets"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM tickets t WHERE t.ticket_id = ticket_messages.ticket_id AND manages_user(t.user_id)));

-- ── Last-seen tracking (#650 complement) ────────────────────────────────────
-- lesson_views had no writer; the student lesson page now upserts one row per
-- (user, lesson) stamped on every open, and the teacher Students tab reads it
-- as activity. The upsert needs this conflict target, and the teacher policy
-- above filters by lesson_id.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_views_user_lesson_unique ON public.lesson_views (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_views_lesson_id ON public.lesson_views (lesson_id);
