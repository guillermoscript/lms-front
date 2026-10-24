-- AI evals hardening: a staff member of tenant A must not be able to queue a run
-- for a lesson/exercise of tenant B (the one-active-run index would then block
-- B's own runs). Two changes:
--   1. the one-active-run index is per tenant, and
--   2. the run INSERT policy also requires the target to belong to tenant_id and
--      version_id to be a version of that very target in that tenant.

-- 1. Index ---------------------------------------------------------------------

DROP INDEX IF EXISTS public.ai_eval_runs_one_active_idx;
CREATE UNIQUE INDEX ai_eval_runs_one_active_idx
  ON public.ai_eval_runs (tenant_id, target_type, target_id) WHERE status IN ('queued', 'running');

-- 2. Insert guard --------------------------------------------------------------
-- SECURITY DEFINER so the check does not depend on the caller's read access to
-- lessons / exercises / versions; it only answers yes or no.

CREATE OR REPLACE FUNCTION public.ai_eval_run_target_ok(
  _tenant_id uuid, _target_type text, _target_id bigint, _version_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  -- Answers only for the caller's own staff tenant, so a direct RPC call can't
  -- probe which ids belong to another school.
  SELECT public.is_staff_of(_tenant_id)
     AND CASE _target_type
           WHEN 'lesson_ai_task' THEN EXISTS (
             SELECT 1 FROM public.lessons l WHERE l.id = _target_id AND l.tenant_id = _tenant_id)
           WHEN 'exercise' THEN EXISTS (
             SELECT 1 FROM public.exercises e WHERE e.id = _target_id AND e.tenant_id = _tenant_id)
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

DROP POLICY IF EXISTS ai_eval_runs_staff_insert ON public.ai_eval_runs;
CREATE POLICY ai_eval_runs_staff_insert ON public.ai_eval_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_staff_of(tenant_id))
    AND created_by = (SELECT auth.uid())
    AND status = 'queued'
    AND (SELECT public.ai_eval_run_target_ok(tenant_id, target_type, target_id, version_id))
  );
