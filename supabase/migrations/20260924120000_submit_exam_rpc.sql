-- Issue #847: an exam is submitted in one transaction, through one function.
--
-- Both clients used to insert `exam_submissions` and then `exam_answers` as two
-- requests. When the second one failed, the submission row stayed behind and
-- `exam_submissions_exam_id_student_id_key` refused every later attempt: the
-- student was locked out of the exam with an empty submission.
--
-- The direct inserts also trusted every column. `authenticated` could INSERT
-- `score`, `review_status`, `ai_data`… on its own row, so a student could hand
-- themselves 100% (the XP and certificate triggers fire on `score IS NOT NULL`)
-- or mark an unanswered submission graded, which opens
-- `get_exam_answer_key` (#840) before answering anything.
--
-- `submit_exam(exam_id, answers)` is now the only client write path:
--   * gated by `can_read_exam()` — the rule the insert policy enforced
--   * `p_answers` is `{ "<question_id>": "<answer_text>" }`; one row per
--     question of the exam ('' when unanswered), unknown keys ignored
--   * idempotent per student: a second call returns the same submission and
--     leaves its answers alone; a submission with NO answers (left by the old
--     two-request flow) gets them filled in, which unlocks those students
-- Grading stays where it is (`POST /api/exams/[examId]/grade`, #841); a
-- submission whose grading failed stays `pending` and can be graded again.

CREATE OR REPLACE FUNCTION public.submit_exam(p_exam_id integer, p_answers jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := (SELECT auth.uid());
  _tenant_id uuid;
  _submission_id integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'p_answers must be an object of question_id → answer_text'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_read_exam(p_exam_id) THEN
    RAISE EXCEPTION 'exam not available' USING ERRCODE = '42501';
  END IF;

  SELECT e.tenant_id INTO _tenant_id FROM public.exams e WHERE e.exam_id = p_exam_id;

  INSERT INTO public.exam_submissions (exam_id, student_id, tenant_id)
  VALUES (p_exam_id, _uid, _tenant_id)
  ON CONFLICT (exam_id, student_id) DO NOTHING
  RETURNING submission_id INTO _submission_id;

  IF _submission_id IS NULL THEN
    -- Already submitted. Lock the row so two concurrent retries of a
    -- half-written submission don't both fill it in.
    SELECT s.submission_id INTO _submission_id
    FROM public.exam_submissions s
    WHERE s.exam_id = p_exam_id AND s.student_id = _uid
    FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.exam_answers a WHERE a.submission_id = _submission_id) THEN
      RETURN _submission_id;
    END IF;
  END IF;

  INSERT INTO public.exam_answers (submission_id, question_id, answer_text)
  SELECT _submission_id, q.question_id, COALESCE(p_answers ->> q.question_id::text, '')
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.question_id;

  RETURN _submission_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam(integer, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_exam(integer, jsonb) IS
  'Submit the caller''s answers to an exam in one transaction (#847). p_answers = {"<question_id>": "<answer_text>"}. Idempotent per student; fills in a submission left without answers. The only client write path into exam_submissions / exam_answers.';

-- ── The direct write path closes ────────────────────────────────────────────

DROP POLICY IF EXISTS "Students can create own exam submissions" ON public.exam_submissions;
DROP POLICY IF EXISTS "Students can create answers for their own submission" ON public.exam_answers;

REVOKE INSERT ON public.exam_submissions FROM anon, authenticated;
REVOKE INSERT ON public.exam_answers FROM anon, authenticated;

-- Legacy, unused, SECURITY INVOKER and executable by PUBLIC; without the
-- INSERT grant it can't run for a client anyway.
DROP FUNCTION IF EXISTS public.create_exam_submission(uuid, integer, jsonb);
