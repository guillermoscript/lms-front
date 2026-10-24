-- AI evals F3: exams become a fourth eval target, `exam` (the AI grader of an
-- exam's free-text questions, feature `exam_grader`), with a `graded_exam`
-- case kind. Cases, runs, results and RLS are target-agnostic and unchanged;
-- results reuse the F2 score columns (scores/score/score_stddev/output).

-- 1. Targets and case kind -------------------------------------------------------

ALTER TABLE public.ai_config_versions DROP CONSTRAINT IF EXISTS ai_config_versions_target_type_check;
ALTER TABLE public.ai_config_versions
  ADD CONSTRAINT ai_config_versions_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint', 'exam'));

ALTER TABLE public.ai_eval_suites DROP CONSTRAINT IF EXISTS ai_eval_suites_target_type_check;
ALTER TABLE public.ai_eval_suites
  ADD CONSTRAINT ai_eval_suites_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint', 'exam'));

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_target_type_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint', 'exam'));

ALTER TABLE public.ai_eval_runs DROP CONSTRAINT IF EXISTS ai_eval_runs_target_type_check;
ALTER TABLE public.ai_eval_runs
  ADD CONSTRAINT ai_eval_runs_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint', 'exam'));

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_kind_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_kind_check CHECK (kind IN ('golden_chat', 'scenario', 'graded_answer', 'graded_exam'));

-- 2. Exam grader versions --------------------------------------------------------

-- Everything that changes how the grader scores the exam: the questions and
-- options as written, a digest of each question's grading secrets, and the AI
-- config. The answer key itself is NOT copied into the snapshot (only md5
-- digests), so a version row never holds key material twice.
CREATE OR REPLACE FUNCTION public.exam_grader_config_snapshot(_exam_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'title', e.title,
    'description', coalesce(e.description, ''),
    'questions', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'question_id', q.question_id,
          'question_type', q.question_type,
          'question_text', q.question_text,
          'points', q.points,
          'options', coalesce((
            SELECT jsonb_agg(jsonb_build_object('option_id', o.option_id, 'option_text', o.option_text) ORDER BY o.option_id)
              FROM public.question_options o WHERE o.question_id = q.question_id), '[]'::jsonb),
          'secrets_md5', md5(
            coalesce(s.correct_answer, '') || '|' ||
            coalesce(s.grading_rubric, '') || '|' ||
            coalesce(s.ai_grading_criteria, '') || '|' ||
            coalesce(array_to_string(s.expected_keywords, ','), '') || '|' ||
            coalesce(array_to_string(s.correct_option_ids, ','), ''))
        ) ORDER BY q.question_id)
      FROM public.exam_questions q
      LEFT JOIN public.exam_grading_secrets s ON s.question_id = q.question_id
      WHERE q.exam_id = e.exam_id), '[]'::jsonb),
    'ai_config', coalesce((
      SELECT jsonb_build_object(
        'ai_grading_prompt', c.ai_grading_prompt,
        'ai_persona', c.ai_persona,
        'ai_feedback_tone', c.ai_feedback_tone,
        'ai_feedback_detail_level', c.ai_feedback_detail_level)
      FROM public.exam_ai_configs c WHERE c.exam_id = e.exam_id), '{}'::jsonb)
  )
    FROM public.exams e
   WHERE e.exam_id = _exam_id;
$$;

REVOKE EXECUTE ON FUNCTION public.exam_grader_config_snapshot(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_grader_config_snapshot(bigint) TO service_role;

-- Returns the version for the exam's current grader config, creating it (next
-- version_no) when new. Service role only: callers verify the tenant. Never
-- return the snapshot to a client.
CREATE OR REPLACE FUNCTION public.ensure_exam_grader_version(_exam_id bigint)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _tenant uuid;
  _snapshot jsonb;
  _hash text;
  _id uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.exams WHERE exam_id = _exam_id;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'exam % not found', _exam_id;
  END IF;

  _snapshot := public.exam_grader_config_snapshot(_exam_id) || jsonb_build_object('grader', 'exam');
  _hash := md5(_snapshot::text);

  SELECT id INTO _id FROM public.ai_config_versions
   WHERE target_type = 'exam' AND target_id = _exam_id AND config_hash = _hash;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  -- Serialise version_no allocation per exam.
  PERFORM pg_advisory_xact_lock(hashtext('ai_config_versions:exam:' || _exam_id));

  INSERT INTO public.ai_config_versions (tenant_id, target_type, target_id, version_no, config_hash, snapshot)
  SELECT _tenant, 'exam', _exam_id,
         coalesce(max(version_no), 0) + 1, _hash, _snapshot
    FROM public.ai_config_versions
   WHERE target_type = 'exam' AND target_id = _exam_id
  ON CONFLICT (target_type, target_id, config_hash) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.ai_config_versions
     WHERE target_type = 'exam' AND target_id = _exam_id AND config_hash = _hash;
  END IF;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_exam_grader_version(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_exam_grader_version(bigint) TO service_role;

-- 3. Insert guard ----------------------------------------------------------------
-- Same function as 20261025140000, plus the exam target (exams.exam_id).

CREATE OR REPLACE FUNCTION public.ai_eval_run_target_ok(
  _tenant_id uuid, _target_type text, _target_id bigint, _version_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.is_staff_of(_tenant_id)
     AND CASE _target_type
           WHEN 'lesson_ai_task' THEN EXISTS (
             SELECT 1 FROM public.lessons l WHERE l.id = _target_id AND l.tenant_id = _tenant_id)
           WHEN 'exercise' THEN EXISTS (
             SELECT 1 FROM public.exercises e WHERE e.id = _target_id AND e.tenant_id = _tenant_id)
           WHEN 'checkpoint' THEN EXISTS (
             SELECT 1 FROM public.lesson_checkpoints c WHERE c.id = _target_id AND c.tenant_id = _tenant_id)
           WHEN 'exam' THEN EXISTS (
             SELECT 1 FROM public.exams x WHERE x.exam_id = _target_id AND x.tenant_id = _tenant_id)
           ELSE false
         END
     AND EXISTS (
       SELECT 1 FROM public.ai_config_versions v
        WHERE v.id = _version_id
          AND v.tenant_id = _tenant_id
          AND v.target_type = _target_type
          AND v.target_id = _target_id);
$$;

REVOKE EXECUTE ON FUNCTION public.ai_eval_run_target_ok(uuid, text, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_eval_run_target_ok(uuid, text, bigint, uuid) TO authenticated, service_role;
