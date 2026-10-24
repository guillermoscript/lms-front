-- AI evals F4 (exercise coach + voice-conversation scenarios): two new case
-- kinds on the existing `exercise` target, and the exercise grader snapshot
-- also covers `description` (the coach prompt shows it). Design:
-- docs/plans/AI_EVALS_AND_SCENARIOS.md. RLS is unchanged (staff-only, target-agnostic).

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_kind_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_kind_check
  CHECK (kind IN ('golden_chat', 'scenario', 'graded_answer', 'graded_exam', 'coach_scenario', 'voice_scenario'));

-- Adds `description`. Existing exercises get a new version on their next run
-- (their snapshot hash changes once), which is expected.
CREATE OR REPLACE FUNCTION public.exercise_grader_config_snapshot(_exercise_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'title', e.title,
    'description', coalesce(e.description, ''),
    'instructions', coalesce(e.instructions, ''),
    'exercise_type', e.exercise_type::text,
    'system_prompt', coalesce(nullif(s.system_prompt, ''), e.system_prompt, ''),
    'exercise_config', coalesce(e.exercise_config, '{}'::jsonb) || coalesce(s.config, '{}'::jsonb)
  )
    FROM public.exercises e
    LEFT JOIN public.exercise_grading_secrets s ON s.exercise_id = e.id
   WHERE e.id = _exercise_id;
$$;

REVOKE EXECUTE ON FUNCTION public.exercise_grader_config_snapshot(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_grader_config_snapshot(bigint) TO service_role;
