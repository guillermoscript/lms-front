-- AI evals F2 (graded exercises): the eval tables learn a second target,
-- `exercise` (AI-graded written/artifact exercises), a `graded_answer` case
-- kind and score columns on results. Design: docs/plans/AI_EVALS_AND_SCENARIOS.md.
--
-- RLS is unchanged: the F1 policies are staff-only and target-agnostic.

-- 1. Targets and case kind ---------------------------------------------------

ALTER TABLE public.ai_config_versions DROP CONSTRAINT IF EXISTS ai_config_versions_target_type_check;
ALTER TABLE public.ai_config_versions
  ADD CONSTRAINT ai_config_versions_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise'));

ALTER TABLE public.ai_eval_suites DROP CONSTRAINT IF EXISTS ai_eval_suites_target_type_check;
ALTER TABLE public.ai_eval_suites
  ADD CONSTRAINT ai_eval_suites_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise'));

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_target_type_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise'));

ALTER TABLE public.ai_eval_runs DROP CONSTRAINT IF EXISTS ai_eval_runs_target_type_check;
ALTER TABLE public.ai_eval_runs
  ADD CONSTRAINT ai_eval_runs_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise'));

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_kind_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_kind_check CHECK (kind IN ('golden_chat', 'scenario', 'graded_answer'));

-- 2. Graded results ----------------------------------------------------------
-- One row per case: the grader runs each answer several times and the repeats
-- are folded into these columns (UNIQUE (run_id, case_id) still holds).

ALTER TABLE public.ai_eval_results
  ADD COLUMN IF NOT EXISTS scores integer[],
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_stddev numeric,
  ADD COLUMN IF NOT EXISTS output jsonb;

COMMENT ON COLUMN public.ai_eval_results.scores IS 'graded_answer: one score per repeat.';
COMMENT ON COLUMN public.ai_eval_results.score IS 'graded_answer: median of scores.';
COMMENT ON COLUMN public.ai_eval_results.score_stddev IS 'graded_answer: population stddev of scores.';
COMMENT ON COLUMN public.ai_eval_results.output IS 'graded_answer: the median repeat''s { feedback, strengths, improvements, passed }.';

-- 3. Exercise grader versions ------------------------------------------------

-- Everything the grader sees, with the staff-only grading secrets merged back
-- (secrets.config over exercise_config, secrets.system_prompt over the column).
CREATE OR REPLACE FUNCTION public.exercise_grader_config_snapshot(_exercise_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'title', e.title,
    'instructions', coalesce(e.instructions, ''),
    'exercise_type', e.exercise_type::text,
    'system_prompt', coalesce(nullif(s.system_prompt, ''), e.system_prompt, ''),
    'exercise_config', coalesce(e.exercise_config, '{}'::jsonb) || coalesce(s.config, '{}'::jsonb)
  )
    FROM public.exercises e
    LEFT JOIN public.exercise_grading_secrets s ON s.exercise_id = e.id
   WHERE e.id = _exercise_id;
$$;

-- Returns the version for the exercise's current grader config, creating it
-- (next version_no) when new. Service role only: callers verify the tenant.
CREATE OR REPLACE FUNCTION public.ensure_exercise_grader_version(_exercise_id bigint)
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
  SELECT tenant_id INTO _tenant FROM public.exercises WHERE id = _exercise_id;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'exercise % not found', _exercise_id;
  END IF;

  _snapshot := public.exercise_grader_config_snapshot(_exercise_id);
  _hash := md5(_snapshot::text);

  SELECT id INTO _id FROM public.ai_config_versions
   WHERE target_type = 'exercise' AND target_id = _exercise_id AND config_hash = _hash;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  -- Serialise version_no allocation per exercise.
  PERFORM pg_advisory_xact_lock(hashtext('ai_config_versions:exercise:' || _exercise_id));

  INSERT INTO public.ai_config_versions (tenant_id, target_type, target_id, version_no, config_hash, snapshot)
  SELECT _tenant, 'exercise', _exercise_id,
         coalesce(max(version_no), 0) + 1, _hash, _snapshot
    FROM public.ai_config_versions
   WHERE target_type = 'exercise' AND target_id = _exercise_id
  ON CONFLICT (target_type, target_id, config_hash) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.ai_config_versions
     WHERE target_type = 'exercise' AND target_id = _exercise_id AND config_hash = _hash;
  END IF;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exercise_grader_config_snapshot(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_grader_config_snapshot(bigint) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_exercise_grader_version(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_exercise_grader_version(bigint) TO service_role;
