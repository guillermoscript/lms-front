-- AI evals F2b: lesson checkpoints become a third eval target, `checkpoint`
-- (the checkpoint's text-answer AI grader, feature `checkpoint_grader`).
-- Cases, runs, results and RLS are target-agnostic and unchanged.

-- 1. Targets -------------------------------------------------------------------

ALTER TABLE public.ai_config_versions DROP CONSTRAINT IF EXISTS ai_config_versions_target_type_check;
ALTER TABLE public.ai_config_versions
  ADD CONSTRAINT ai_config_versions_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint'));

ALTER TABLE public.ai_eval_suites DROP CONSTRAINT IF EXISTS ai_eval_suites_target_type_check;
ALTER TABLE public.ai_eval_suites
  ADD CONSTRAINT ai_eval_suites_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint'));

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT IF EXISTS ai_eval_cases_target_type_check;
ALTER TABLE public.ai_eval_cases
  ADD CONSTRAINT ai_eval_cases_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint'));

ALTER TABLE public.ai_eval_runs DROP CONSTRAINT IF EXISTS ai_eval_runs_target_type_check;
ALTER TABLE public.ai_eval_runs
  ADD CONSTRAINT ai_eval_runs_target_type_check CHECK (target_type IN ('lesson_ai_task', 'exercise', 'checkpoint'));

-- 2. Checkpoint grader versions --------------------------------------------------
-- The grader sees the linked exercise (secrets merged back) through the
-- checkpoint's own prompt, so the version is the exercise's grader snapshot
-- tagged with the feature. Service role only: callers verify the tenant.

CREATE OR REPLACE FUNCTION public.ensure_checkpoint_grader_version(_checkpoint_id bigint)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _tenant uuid;
  _exercise_id integer;
  _snapshot jsonb;
  _hash text;
  _id uuid;
BEGIN
  SELECT c.tenant_id, c.exercise_id INTO _tenant, _exercise_id
    FROM public.lesson_checkpoints c WHERE c.id = _checkpoint_id;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'checkpoint % not found', _checkpoint_id;
  END IF;

  _snapshot := coalesce(public.exercise_grader_config_snapshot(_exercise_id), '{}'::jsonb)
               || jsonb_build_object('grader', 'checkpoint');
  _hash := md5(_snapshot::text);

  SELECT id INTO _id FROM public.ai_config_versions
   WHERE target_type = 'checkpoint' AND target_id = _checkpoint_id AND config_hash = _hash;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  -- Serialise version_no allocation per checkpoint.
  PERFORM pg_advisory_xact_lock(hashtext('ai_config_versions:checkpoint:' || _checkpoint_id));

  INSERT INTO public.ai_config_versions (tenant_id, target_type, target_id, version_no, config_hash, snapshot)
  SELECT _tenant, 'checkpoint', _checkpoint_id,
         coalesce(max(version_no), 0) + 1, _hash, _snapshot
    FROM public.ai_config_versions
   WHERE target_type = 'checkpoint' AND target_id = _checkpoint_id
  ON CONFLICT (target_type, target_id, config_hash) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.ai_config_versions
     WHERE target_type = 'checkpoint' AND target_id = _checkpoint_id AND config_hash = _hash;
  END IF;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_checkpoint_grader_version(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_checkpoint_grader_version(bigint) TO service_role;

-- 3. Insert guard ----------------------------------------------------------------
-- Same function as 20261025130000, plus the checkpoint target (its row carries
-- tenant_id directly).

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
