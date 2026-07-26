-- Issue #543 (EPIC #540 §1.3) — a client may not assert its own grade,
-- completion, mastery or tenant.
--
-- #532 (20260725160000) stamped the rule on `enrollments`: "Never gate content,
-- APIs or RLS on the presence of an enrollment row." Four write-side policies
-- were never brought along. Each constrains WHO the row belongs to and nothing
-- about whether the writer earned it:
--
--   lesson_completions       WITH CHECK (auth.uid() = user_id)
--   exam_submissions         WITH CHECK (auth.uid() = student_id AND tenant_id = get_tenant_id())
--   lesson_checkpoint_attempts  pins identity + checkpoint consistency + access,
--                            but leaves score/passed/completed/evaluator_type free
--   practice_attempts        FOR ALL USING/WITH CHECK (user_id = auth.uid()) — no tenant predicate
--
-- Plus one read-side straggler: `lesson_checkpoints` SELECT still authorizes by
-- joining `enrollments`, which no revocation path ever removes.
--
-- SHAPE. The three predicates below mirror the #509 content read policies
-- (20260724150000): tenant match AND (staff OR course author OR
-- has_course_access). Teachers and admins hold no entitlement for the courses
-- they author, so the staff/author branches are what keep authoring and course
-- preview working; students only ever match the has_course_access branch.
--
-- `has_course_access(uuid, integer)` takes integer. `lessons.course_id` and
-- `practice_attempts.course_id` are bigint, hence the ::integer casts;
-- `exams.course_id` is already integer.

-- ---------------------------------------------------------------------------
-- 1. lesson_completions — completion is the certificate's eligibility source.
--
-- `app/api/certificates/issue/route.ts` counts these rows to decide whether to
-- mint the school's credential, so a self-issuable completion is a
-- self-issuable certificate. The table has no `tenant_id` (see CLAUDE.md), so
-- the course is reached through `lessons`.
--
-- Preview lessons (#426) are deliberately NOT a branch here: a prospective
-- buyer may read a preview lesson, but recording progress against a course
-- they have not bought is exactly what this policy exists to stop.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Students can mark lessons complete" ON public.lesson_completions;

CREATE POLICY "Students can mark lessons complete"
  ON public.lesson_completions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_completions.lesson_id
        AND (
          (SELECT public.is_tenant_staff())
          OR EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.course_id = l.course_id
              AND c.author_id = (SELECT auth.uid())
          )
          OR public.has_course_access((SELECT auth.uid()), l.course_id::integer)
        )
    )
  );

COMMENT ON TABLE public.lesson_completions IS
  'Progress record, and the eligibility source /api/certificates/issue counts. '
  'INSERT requires course access (#543) — a completion is not self-issuable.';

-- ---------------------------------------------------------------------------
-- 2. exam_submissions — submitting enqueues AI grading on the school's budget.
--
-- Without an access predicate, a student with no entitlement (or one past the
-- tenant's `access_cutoff_at`, which lives inside has_course_access) can POST
-- submissions that `app/actions/exam-grading.ts` then grades against the
-- school's plan allowance.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Students can create own exam submissions" ON public.exam_submissions;

CREATE POLICY "Students can create own exam submissions"
  ON public.exam_submissions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = student_id
    AND tenant_id = (SELECT public.get_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.exam_id = exam_submissions.exam_id
        AND e.tenant_id = exam_submissions.tenant_id
        AND (
          (SELECT public.is_tenant_staff())
          OR EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.course_id = e.course_id
              AND c.author_id = (SELECT auth.uid())
          )
          OR public.has_course_access((SELECT auth.uid()), e.course_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. lesson_checkpoint_attempts — server-write-only, per the #538 pattern.
--
-- #532 gated WHO may insert (own user, enabled checkpoint, consistent
-- checkpoint/lesson/exercise/tenant, has_course_access) and that part holds.
-- What no policy could express is that `score`, `passed`, `completed`,
-- `evaluation`, `response`, `evaluator_type` and `attempt_number` must be the
-- server grader's output rather than the caller's claim:
--
--   * `{passed: true, score: 100, completed: true}` satisfies any is_required
--     checkpoint without answering — lib/checkpoints/load.ts reads
--     `latestAttempt.passed` off the newest row and required checkpoints gate
--     lesson progression.
--   * rows tagged `evaluator_type = 'ai'` are what countAiAttempts() bills
--     against the per-student AND per-tenant monthly AI allowance, so one
--     student could exhaust AI evaluation for every classmate in the school.
--
-- The only legitimate writer is app/api/lesson-checkpoints/[checkpointId]/
-- attempt/route.ts, which already holds an admin client and already carries
-- its own resolveCourseAccessState() gate (#535). Its insert moves to that
-- client in this change, so the student INSERT grant has no remaining user.
-- Reads are untouched: students still read their own rows, staff the tenant's.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lesson_checkpoint_attempts_students_insert_own_rows
  ON public.lesson_checkpoint_attempts;

REVOKE INSERT, UPDATE, DELETE ON public.lesson_checkpoint_attempts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_checkpoint_attempts FROM anon;

COMMENT ON TABLE public.lesson_checkpoint_attempts IS
  'Server-write-only (#543). Every column but the identity ones is a grading '
  'output; the attempt API route writes them with the service-role client after '
  'grading. `authenticated` holds SELECT only — a user-scoped INSERT failing '
  'with "permission denied for table lesson_checkpoint_attempts" is by design.';

-- ---------------------------------------------------------------------------
-- 4. practice_attempts — two SECURITY DEFINER triggers fire on a row the
--    caller fully controls.
--
--   handle_practice_attempt_elo → elo_apply_match(new.tenant_id, …) writes the
--     TENANT-SHARED `item_ratings` anchors and `student_topic_ratings`.
--   handle_practice_attempt_xp  → award_xp(…, new.tenant_id) upserts a
--     `gamification_profiles` row for (user_id, new.tenant_id) unconditionally,
--     which is the eligibility source rollover_leagues() scans — so a
--     non-member appears in another school's league standings.
--
-- 20260716120000_create_elo_ratings.sql justified the trigger design with "a
-- student session cannot write shared rating rows from application code". That
-- only holds if the row's tenant is the caller's own, which nothing checked.
--
-- The blanket FOR ALL policy is split so graded history is append-only: no
-- UPDATE or DELETE policy, and the grants go with it.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS students_own_practice_attempts ON public.practice_attempts;

CREATE POLICY practice_attempts_students_read_own_rows
  ON public.practice_attempts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY practice_attempts_students_insert_own_rows
  ON public.practice_attempts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    -- Membership of the tenant being written to, from `tenant_users` rather
    -- than the client-settable x-tenant-id header.
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid())
        AND tu.tenant_id = practice_attempts.tenant_id
        AND tu.status = 'active'
    )
  );

-- Deliberately NOT gated on `course_id`. It is an optional, model-supplied
-- label on the MCP tool ("Related course, if any" —
-- mcp-server/src/tools/practice.ts), not a value derived from anything the
-- server verified, so an access predicate on it would turn a mislabelled
-- drill into a hard write failure. It also guards little: the cross-tenant
-- attack this policy exists to stop is closed by the membership check above,
-- and `course_id` only scopes `item_ratings` anchors WITHIN the caller's own
-- tenant.

REVOKE UPDATE, DELETE ON public.practice_attempts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.practice_attempts FROM anon;

-- Self-reported figures still decide XP (#349), the #393 mastery gate and the
-- #396 Elo update, so bound them to what a score can actually be.
ALTER TABLE public.practice_attempts
  DROP CONSTRAINT IF EXISTS practice_attempts_score_range;
ALTER TABLE public.practice_attempts
  ADD CONSTRAINT practice_attempts_score_range
  CHECK (score >= 0 AND score <= 100);

ALTER TABLE public.practice_attempts
  DROP CONSTRAINT IF EXISTS practice_attempts_counts_coherent;
ALTER TABLE public.practice_attempts
  ADD CONSTRAINT practice_attempts_counts_coherent
  CHECK (
    total_questions > 0
    AND correct_count >= 0
    AND correct_count <= total_questions
  );

-- `mode` was pinned at 20260715120000; `source` never was.
ALTER TABLE public.practice_attempts
  DROP CONSTRAINT IF EXISTS practice_attempts_source_known;
ALTER TABLE public.practice_attempts
  ADD CONSTRAINT practice_attempts_source_known
  CHECK (source IN ('mcp-tutor'));

COMMENT ON TABLE public.practice_attempts IS
  'AI-tutor drill history. Append-only for `authenticated` (#543): INSERT '
  'requires active membership of the named tenant, and score/count columns '
  'are range-checked, because two SECURITY DEFINER triggers write '
  'tenant-shared Elo anchors and gamification rows from this row.';

-- ---------------------------------------------------------------------------
-- 5. lesson_checkpoints SELECT — the last `enrollments` join in the feature.
--
-- A refunded student keeps their `enrollments` row (lib/payments/
-- webhook-dispatch.ts revokes entitlements, never enrollments), so they kept
-- reading every enabled checkpoint on the course. Same shape as before —
-- is_enabled, tenant match, lesson in the same tenant — with the enrollment
-- join replaced by the access gate the rest of the feature uses.
-- Staff are already covered by lesson_checkpoints_teachers_manage_tenant.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lesson_checkpoints_students_can_read_enrolled_lessons
  ON public.lesson_checkpoints;

CREATE POLICY lesson_checkpoints_students_can_read_entitled_lessons
  ON public.lesson_checkpoints FOR SELECT TO authenticated
  USING (
    is_enabled
    AND EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_checkpoints.lesson_id
        AND l.tenant_id = lesson_checkpoints.tenant_id
        AND public.has_course_access((SELECT auth.uid()), l.course_id::integer)
    )
  );
