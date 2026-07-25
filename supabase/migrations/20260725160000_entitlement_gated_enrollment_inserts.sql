-- Issue #532 — an `enrollments` row is not an access grant.
--
-- Since migration 20260516150000, `enrollments` is a learning-progress record
-- and `entitlements` is the source of truth for course access. The INSERT
-- policy below never caught up: its WITH CHECK was
--
--   (auth.uid() = user_id) AND (tenant_id = get_tenant_id())
--
-- so any tenant member could POST /rest/v1/enrollments for any course in
-- their tenant and manufacture a row that *looks* like proof of access.
-- Nothing revokes an enrollment either — refunds revoke entitlements
-- (lib/payments/webhook-dispatch.ts) and `tenants.access_cutoff_at` (#494) is
-- read only inside has_course_access() — so the row also survives every
-- revocation path. Code that reads it as an access check (the lesson-checkpoint
-- attempt API route, and the checkpoint-attempt INSERT policy below) was
-- therefore gate-less in three cases: past the tenant access cutoff, after a
-- refund, and for a self-inserted row.
--
-- Both policies now gate on has_course_access(), the same function the page
-- guards and the content RLS from #509 use.
--
-- Safe for every legitimate writer: enroll_user(), self_enroll_subscription_course(),
-- grant_free_entitlement() and issue_certificate_if_eligible() are all
-- SECURITY DEFINER (RLS does not apply to them), and admin/seed paths use the
-- service-role client. No client-side `enrollments` INSERT exists in the app.
-- The policy is tightened rather than dropped so any caller that genuinely
-- holds access keeps working.

DROP POLICY IF EXISTS "Users can create own enrollments" ON public.enrollments;

CREATE POLICY "Users can create own enrollments"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND public.has_course_access((SELECT auth.uid()), course_id)
  );

-- The checkpoint-attempt insert policy leaned on the same self-issuable row.
-- Everything else about it is unchanged: same user, same enabled checkpoint,
-- same (checkpoint, lesson, exercise, tenant) consistency requirement.
DROP POLICY IF EXISTS lesson_checkpoint_attempts_students_insert_own_rows
  ON public.lesson_checkpoint_attempts;

CREATE POLICY lesson_checkpoint_attempts_students_insert_own_rows
  ON public.lesson_checkpoint_attempts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM lesson_checkpoints c
      WHERE c.id = lesson_checkpoint_attempts.checkpoint_id
        AND c.tenant_id = lesson_checkpoint_attempts.tenant_id
        AND c.lesson_id = lesson_checkpoint_attempts.lesson_id
        AND c.exercise_id = lesson_checkpoint_attempts.exercise_id
        AND c.is_enabled
    )
    AND public.has_course_access((SELECT auth.uid()), lesson_checkpoint_attempts.course_id)
  );

COMMENT ON TABLE public.enrollments IS
  'Learning-progress record only (since 20260516150000). NOT an access grant: '
  'course access lives in `entitlements` and is checked with has_course_access(). '
  'Never gate content, APIs or RLS on the presence of an enrollment row.';
