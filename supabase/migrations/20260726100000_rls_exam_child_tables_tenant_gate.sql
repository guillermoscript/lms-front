-- Issue #542 (EPIC #540 §1.2) — gate the exam child tables and lesson comments
-- through their parent, and stop the #509 preview branch overshooting.
--
-- `20260313152048_rls_exam_child_tables.sql` created the SELECT policies on
-- `exam_questions` and `question_options` as `USING (true)`. #509 replaced the
-- **parent** `exams` policy with a tenant + staff/author + `has_course_access`
-- gate and stopped there, so the answer key (`correct_answer`, `grading_rubric`,
-- `ai_grading_criteria`, `expected_keywords`, `question_options.is_correct`) was
-- readable over PostgREST by any authenticated user of any tenant, holding no
-- entitlement, past their school's `access_cutoff_at`. `lesson_comments` is the
-- same shape with lower stakes.
--
-- These tables have NO `tenant_id` of their own (see CLAUDE.md — adding one to a
-- query errors it outright, which is what broke teacher grading in #282), so the
-- predicate routes through the FK to the parent that does.
--
-- ALSO tightened, beyond the four SELECT policies the issue lists: the sibling
-- `FOR ALL` staff policies on both exam tables. They read
-- `get_tenant_role() IN ('teacher','admin')` with **no row predicate at all**, and
-- permissive policies OR together — so without this a teacher of tenant A keeps
-- reading (and writing) every exam question in every other tenant through that
-- policy, and the SELECT fix below buys nothing for staff accounts.
--
-- Every policy is DROP + CREATE, never supplemented: permissive policies OR
-- together, so an added policy could only ever widen access.

-- Shared predicate for the two exam child tables. Mirrors the #509 `exams`
-- SELECT policy ("Students can view tenant exams") plus the pre-existing
-- "Super admins can view all exams" policy, so a row is readable exactly when
-- its parent `exams` row is.
--
-- SECURITY INVOKER on purpose: `get_tenant_id()`, `auth.uid()` and
-- `is_tenant_staff()` must resolve to the caller, and RLS on `exams` still
-- applies inside it, which makes the check belt-and-braces rather than a
-- second, drift-prone copy of the parent gate.
CREATE OR REPLACE FUNCTION public.can_read_exam(_exam_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM exams e
    WHERE e.exam_id = _exam_id
      AND (
        (SELECT is_super_admin())
        OR (
          e.tenant_id = (SELECT get_tenant_id())
          AND (
            -- Staff branch. Teachers and admins hold no entitlement for the
            -- courses they author, and the exam editor, the teacher grading
            -- screens and the AI grading path all read these tables through an
            -- RLS-bound user client — drop this and grading breaks rather than
            -- fails safe.
            (SELECT is_tenant_staff())
            OR EXISTS (
              SELECT 1 FROM courses c
              WHERE c.course_id = e.course_id
                AND c.author_id = (SELECT auth.uid())
            )
            OR has_course_access((SELECT auth.uid()), e.course_id)
          )
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.can_read_exam(integer) IS
  'True when the caller may read the given exam under the #509 gate (tenant + staff/author/entitlement, or super admin). Used by the exam_questions and question_options SELECT policies, which have no tenant_id of their own (#542).';

-- Functions in `public` carry a default PUBLIC execute grant, which would put
-- this on the REST surface for `anon` too. Neither exam child table is readable
-- by anon, so anon never needs it.
REVOKE EXECUTE ON FUNCTION public.can_read_exam(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_exam(integer) TO authenticated;

-- exam_questions ---------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view exam questions" ON public.exam_questions;
CREATE POLICY "Users can view questions of readable exams"
  ON public.exam_questions FOR SELECT TO authenticated
  USING (public.can_read_exam(exam_questions.exam_id));

-- Staff CRUD, scoped to the tenant the caller is acting in. `get_tenant_role()`
-- is kept (rather than swapped for `is_tenant_staff()`) to leave the write gate
-- itself untouched; the change here is purely the added row predicate.
DROP POLICY IF EXISTS "Teachers and admins can manage exam questions" ON public.exam_questions;
CREATE POLICY "Teachers and admins can manage exam questions"
  ON public.exam_questions FOR ALL TO authenticated
  USING (
    (SELECT public.get_tenant_role()) IN ('teacher', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.exam_id = exam_questions.exam_id
        AND e.tenant_id = (SELECT public.get_tenant_id())
    )
  )
  WITH CHECK (
    (SELECT public.get_tenant_role()) IN ('teacher', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.exam_id = exam_questions.exam_id
        AND e.tenant_id = (SELECT public.get_tenant_id())
    )
  );

-- question_options -------------------------------------------------------
-- Two hops: question_options -> exam_questions -> exams.
DROP POLICY IF EXISTS "Authenticated users can view question options" ON public.question_options;
CREATE POLICY "Users can view options of readable exams"
  ON public.question_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_questions q
      WHERE q.question_id = question_options.question_id
        AND public.can_read_exam(q.exam_id)
    )
  );

DROP POLICY IF EXISTS "Teachers and admins can manage question options" ON public.question_options;
CREATE POLICY "Teachers and admins can manage question options"
  ON public.question_options FOR ALL TO authenticated
  USING (
    (SELECT public.get_tenant_role()) IN ('teacher', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.exam_questions q
      JOIN public.exams e ON e.exam_id = q.exam_id
      WHERE q.question_id = question_options.question_id
        AND e.tenant_id = (SELECT public.get_tenant_id())
    )
  )
  WITH CHECK (
    (SELECT public.get_tenant_role()) IN ('teacher', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.exam_questions q
      JOIN public.exams e ON e.exam_id = q.exam_id
      WHERE q.question_id = question_options.question_id
        AND e.tenant_id = (SELECT public.get_tenant_id())
    )
  );

-- lessons ----------------------------------------------------------------
-- #509 gave authenticated users a preview branch of
-- `(is_preview AND status = 'published')`, justified as "a logged-in
-- prospective buyer must not see less than an anonymous one". The anon policy
-- it mirrors carries one more condition: the parent course must be published
-- too. So a teacher drafting a course who marks a lesson preview + published
-- exposed that lesson body to every signed-in member of the tenant while
-- anonymous visitors correctly could not see it. Converge the two.
--
-- Only the preview branch changes; the staff, author and entitlement branches
-- are carried over verbatim from 20260724150000.
DROP POLICY IF EXISTS "Users can view tenant lessons" ON public.lessons;
CREATE POLICY "Users can view tenant lessons"
  ON public.lessons FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR (
        is_preview = true
        AND status = 'published'
        AND EXISTS (
          SELECT 1 FROM public.courses c
          WHERE c.course_id = lessons.course_id
            AND c.status = 'published'
            AND c.tenant_id = lessons.tenant_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = lessons.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR public.has_course_access((SELECT auth.uid()), lessons.course_id::integer)
    )
  );

-- lesson_comments --------------------------------------------------------
-- No tenant_id here either; mirror the lessons gate above through the FK,
-- plus the pre-existing "Super admins can view all lessons" policy, so a
-- thread is readable exactly when the lesson it hangs off is.
DROP POLICY IF EXISTS "Authenticated users can view lesson comments" ON public.lesson_comments;
CREATE POLICY "Users can view comments on readable lessons"
  ON public.lesson_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_comments.lesson_id
        AND (
          (SELECT public.is_super_admin())
          OR (
            l.tenant_id = (SELECT public.get_tenant_id())
            AND (
              (SELECT public.is_tenant_staff())
              OR (
                l.is_preview = true
                AND l.status = 'published'
                AND EXISTS (
                  SELECT 1 FROM public.courses c
                  WHERE c.course_id = l.course_id
                    AND c.status = 'published'
                    AND c.tenant_id = l.tenant_id
                )
              )
              OR EXISTS (
                SELECT 1 FROM public.courses c
                WHERE c.course_id = l.course_id
                  AND c.author_id = (SELECT auth.uid())
              )
              OR public.has_course_access((SELECT auth.uid()), l.course_id::integer)
            )
          )
        )
    )
  );

-- Supporting indexes. Each new predicate looks the child rows up by their FK,
-- and none of these three FKs was indexed.
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id
  ON public.exam_questions (exam_id);
CREATE INDEX IF NOT EXISTS idx_question_options_question_id
  ON public.question_options (question_id);
CREATE INDEX IF NOT EXISTS idx_lesson_comments_lesson_id
  ON public.lesson_comments (lesson_id);
