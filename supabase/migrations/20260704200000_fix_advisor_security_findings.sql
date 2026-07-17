-- Fixes 6 confirmed advisor security findings (post issue #280 advisor sweep):
--
-- 1-4. security_definer_view: exercise_view, get_reviews, distinct_exam_views,
--      distinct_lesson_views ran as their creator (postgres), bypassing the
--      base tables' RLS entirely for anon/authenticated callers via PostgREST.
--      None of the 4 has any app-code caller — safe to flip to
--      security_invoker so the caller's own RLS applies (exercises/exams have
--      no anon SELECT policy at all → anon now gets 0 rows; authenticated is
--      correctly tenant-scoped via the base tables' existing policies).
--
-- 5. certificates: "System can insert certificates" was WITH CHECK (true) for
--    role public — anyone could forge a certificate for any user/course/tenant.
--    The only real INSERT path (lib/certificates/issue-certificate.ts) runs
--    under the CALLER's own session (not admin), and can be teacher-initiated
--    for a DIFFERENT student (app/api/certificates/issue/route.ts) — so the
--    replacement mirrors the exact same trust boundary already used by this
--    table's own SELECT/UPDATE policies (self, or teacher/admin, or course
--    author), instead of a blanket true.
--
-- 6. exam_answers: BOTH its SELECT ("Authenticated users can view exam
--    answers", USING (true)) and INSERT ("Authenticated users can create exam
--    answers", WITH CHECK (true)) had zero scoping — any authenticated user
--    could read every tenant's exam answers, and insert an answer row against
--    ANY submission_id (including another student's), directly setting
--    is_correct/feedback to fake a grade. Replaced with policies mirroring
--    exam_submissions' own tenant/role scoping (which this table has none of
--    itself — it only has submission_id, no tenant_id/student_id columns).
--    is_correct/feedback are now blocked at INSERT time (must be NULL) since
--    grading only ever UPDATEs an existing row via a separate, already-correct
--    teacher/admin-scoped policy (untouched here).

-- 1-4. Views: run as the querying role, not the creator.
alter view public.exercise_view set (security_invoker = true);
alter view public.get_reviews set (security_invoker = true);
alter view public.distinct_exam_views set (security_invoker = true);
alter view public.distinct_lesson_views set (security_invoker = true);

-- 5. certificates INSERT: self-issuance, teacher/admin, or the course's author.
drop policy if exists "System can insert certificates" on public.certificates;
create policy "Students, teachers, admins, or course authors can insert certificates"
  on public.certificates
  for insert
  to public
  with check (
    (user_id = (select auth.uid()))
    or (exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any (array['teacher'::app_role, 'admin'::app_role])
    ))
    or (exists (
      select 1 from public.courses c
      where c.course_id = certificates.course_id
        and c.author_id = (select auth.uid())
    ))
  );

-- 6. exam_answers SELECT: own submission, or teacher/admin/super-admin of the
--    submission's tenant — mirrors exam_submissions' own SELECT policies.
drop policy if exists "Authenticated users can view exam answers" on public.exam_answers;
create policy "Users can view answers for accessible submissions"
  on public.exam_answers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.exam_submissions s
      where s.submission_id = exam_answers.submission_id
        and (
          s.student_id = (select auth.uid())
          or (select is_super_admin())
          or (
            s.tenant_id = (select get_tenant_id())
            and (select get_tenant_role()) = any (array['teacher', 'admin'])
          )
        )
    )
  );

-- 6. exam_answers INSERT: only the submission's own student, tenant-scoped,
--    and is_correct/feedback must be NULL at insert time (grading is an
--    UPDATE via the existing, separately-scoped teacher/admin policy).
drop policy if exists "Authenticated users can create exam answers" on public.exam_answers;
create policy "Students can create answers for their own submission"
  on public.exam_answers
  for insert
  to authenticated
  with check (
    is_correct is null
    and feedback is null
    and exists (
      select 1 from public.exam_submissions s
      where s.submission_id = exam_answers.submission_id
        and s.student_id = (select auth.uid())
        and s.tenant_id = (select get_tenant_id())
    )
  );
