-- AI evals F1 (lesson AI task): prompt versions, eval cases (goldens +
-- scenarios), runs and results, plus the version stamp on real student chats.
-- Design: docs/plans/AI_EVALS_AND_SCENARIOS.md.
--
-- Every table carries tenant_id and is staff-only (is_staff_of): snapshots and
-- cases hold the teacher's private prompt, which students must never read.
-- Versions are written only by the SECURITY DEFINER helper below (the save
-- trigger and the eval routes through the service role); run status and
-- results are written only by the runner (service role).

-- 1. Prompt versions -------------------------------------------------------

CREATE TABLE public.ai_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('lesson_ai_task')),
  target_id bigint NOT NULL,
  version_no integer NOT NULL,
  config_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, config_hash),
  UNIQUE (target_type, target_id, version_no)
);

CREATE INDEX ai_config_versions_tenant_idx ON public.ai_config_versions (tenant_id);

COMMENT ON TABLE public.ai_config_versions IS
  'Immutable snapshots of an AI task config (prompt, task, requirements). One row per distinct config; the live lessons_ai_tasks row maps to the version with the same hash.';

-- The canonical snapshot. jsonb::text is key-ordered, so md5 of it is stable.
CREATE OR REPLACE FUNCTION public.lesson_task_config_snapshot(
  _task_instructions text, _system_prompt text, _requirements jsonb
)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'task_instructions', coalesce(_task_instructions, ''),
    'system_prompt', coalesce(_system_prompt, ''),
    'requirements', _requirements
  );
$$;

-- Returns the version for a config, creating it (next version_no) when new.
-- Not exposed to clients: callers verify the lesson's tenant first.
CREATE OR REPLACE FUNCTION public.ensure_lesson_task_version(
  _lesson_id bigint, _task_instructions text, _system_prompt text, _requirements jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
  _snapshot jsonb := public.lesson_task_config_snapshot(_task_instructions, _system_prompt, _requirements);
  _hash text := md5(_snapshot::text);
  _id uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM lessons WHERE id = _lesson_id;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'lesson % not found', _lesson_id;
  END IF;

  SELECT id INTO _id FROM ai_config_versions
   WHERE target_type = 'lesson_ai_task' AND target_id = _lesson_id AND config_hash = _hash;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  -- Serialise version_no allocation per lesson.
  PERFORM pg_advisory_xact_lock(hashtext('ai_config_versions:lesson_ai_task:' || _lesson_id));

  INSERT INTO ai_config_versions (tenant_id, target_type, target_id, version_no, config_hash, snapshot)
  SELECT _tenant, 'lesson_ai_task', _lesson_id,
         coalesce(max(version_no), 0) + 1, _hash, _snapshot
    FROM ai_config_versions
   WHERE target_type = 'lesson_ai_task' AND target_id = _lesson_id
  ON CONFLICT (target_type, target_id, config_hash) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM ai_config_versions
     WHERE target_type = 'lesson_ai_task' AND target_id = _lesson_id AND config_hash = _hash;
  END IF;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_lesson_task_version(bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_lesson_task_version(bigint, text, text, jsonb) TO service_role;

-- Every save of the live task (server action RPC, MCP, restore) records a version.
CREATE OR REPLACE FUNCTION public.trg_lessons_ai_tasks_version()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lesson_id IS NOT NULL THEN
    PERFORM public.ensure_lesson_task_version(NEW.lesson_id, NEW.task_instructions, NEW.system_prompt, NEW.requirements);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lessons_ai_tasks_version
  AFTER INSERT OR UPDATE OF task_instructions, system_prompt, requirements ON public.lessons_ai_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_lessons_ai_tasks_version();

-- Backfill: the current config of every existing task becomes its v1.
SELECT public.ensure_lesson_task_version(t.lesson_id, t.task_instructions, t.system_prompt, t.requirements)
  FROM public.lessons_ai_tasks t
  JOIN public.lessons l ON l.id = t.lesson_id;

-- 2. Real chats carry the version students were served ---------------------

ALTER TABLE public.lessons_ai_task_messages
  ADD COLUMN IF NOT EXISTS config_version_id uuid REFERENCES public.ai_config_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lessons_ai_task_messages_version_idx
  ON public.lessons_ai_task_messages (lesson_id, config_version_id);

-- Stamped in the database so no write path can forget it.
CREATE OR REPLACE FUNCTION public.trg_lessons_ai_task_messages_version()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.config_version_id IS NULL AND NEW.lesson_id IS NOT NULL THEN
    SELECT v.id INTO NEW.config_version_id
      FROM lessons_ai_tasks t
      JOIN ai_config_versions v
        ON v.target_type = 'lesson_ai_task'
       AND v.target_id = t.lesson_id
       AND v.config_hash = md5(public.lesson_task_config_snapshot(t.task_instructions, t.system_prompt, t.requirements)::text)
     WHERE t.lesson_id = NEW.lesson_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lessons_ai_task_messages_version
  BEFORE INSERT ON public.lessons_ai_task_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_lessons_ai_task_messages_version();

-- 3. Suites, cases, runs, results ------------------------------------------

CREATE TABLE public.ai_eval_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('lesson_ai_task')),
  target_id bigint NOT NULL,
  -- Regenerate untouched generated scenarios when the config changes.
  auto_regenerate boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id)
);

CREATE TABLE public.ai_eval_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('lesson_ai_task')),
  target_id bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('golden_chat', 'scenario')),
  source text NOT NULL CHECK (source IN ('preview', 'real_chat', 'generated', 'teacher')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  importance_note text CHECK (char_length(importance_note) <= 2000),
  -- { "completed": true | false | null }  (null = either is fine)
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Plain-language criteria the judge checks ("does not reveal the answer").
  must_keep text[] NOT NULL DEFAULT '{}',
  -- golden_chat: { "messages": [{ "role": "user"|"assistant", "text": "..." }] }
  -- scenario:    { "persona", "goal", "script": [...], "max_turns" }
  input jsonb NOT NULL,
  -- golden_chat: what happened when it was saved ({ completed, completed_turn, version_id })
  golden_output jsonb,
  generated_for_version_id uuid REFERENCES public.ai_config_versions(id) ON DELETE SET NULL,
  teacher_edited boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_eval_cases_target_idx ON public.ai_eval_cases (target_type, target_id);
CREATE INDEX ai_eval_cases_tenant_idx ON public.ai_eval_cases (tenant_id);

CREATE TABLE public.ai_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('lesson_ai_task')),
  target_id bigint NOT NULL,
  version_id uuid NOT NULL REFERENCES public.ai_config_versions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  -- { total, passed, drifted, verdict_changes, avg_deviation, model_calls }
  summary jsonb,
  -- { tutor, verifier, simulator, judge } as "provider/model"
  model_ids jsonb,
  error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX ai_eval_runs_target_idx ON public.ai_eval_runs (target_type, target_id, created_at DESC);
CREATE INDEX ai_eval_runs_tenant_idx ON public.ai_eval_runs (tenant_id);
-- One active run per target: a second "Run" while one is going is refused.
CREATE UNIQUE INDEX ai_eval_runs_one_active_idx
  ON public.ai_eval_runs (target_type, target_id) WHERE status IN ('queued', 'running');

CREATE TABLE public.ai_eval_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.ai_eval_runs(id) ON DELETE CASCADE,
  -- Kept when the case is deleted later, so old reports still read.
  case_id uuid REFERENCES public.ai_eval_cases(id) ON DELETE SET NULL,
  case_name text NOT NULL,
  case_kind text NOT NULL,
  -- The case's expected outcome at run time ({ "completed": true|false|null }).
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "role": "user"|"assistant", "text": "..." }]
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean,
  completed_turn integer,
  -- [{ "criterion", "passed", "evidence" }]
  verdicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  deviation integer CHECK (deviation BETWEEN 0 AND 100),
  passed boolean,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, case_id)
);

CREATE INDEX ai_eval_results_run_idx ON public.ai_eval_results (run_id);
CREATE INDEX ai_eval_results_tenant_idx ON public.ai_eval_results (tenant_id);

-- 4. RLS --------------------------------------------------------------------

ALTER TABLE public.ai_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_eval_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_eval_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_config_versions, public.ai_eval_suites, public.ai_eval_cases,
  public.ai_eval_runs, public.ai_eval_results FROM anon;

CREATE POLICY ai_config_versions_staff_select ON public.ai_config_versions
  FOR SELECT TO authenticated USING ((SELECT public.is_staff_of(tenant_id)));

CREATE POLICY ai_eval_suites_staff_all ON public.ai_eval_suites
  FOR ALL TO authenticated
  USING ((SELECT public.is_staff_of(tenant_id)))
  WITH CHECK ((SELECT public.is_staff_of(tenant_id)));

CREATE POLICY ai_eval_cases_staff_all ON public.ai_eval_cases
  FOR ALL TO authenticated
  USING ((SELECT public.is_staff_of(tenant_id)))
  WITH CHECK ((SELECT public.is_staff_of(tenant_id)));

CREATE POLICY ai_eval_runs_staff_select ON public.ai_eval_runs
  FOR SELECT TO authenticated USING ((SELECT public.is_staff_of(tenant_id)));

CREATE POLICY ai_eval_runs_staff_insert ON public.ai_eval_runs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_of(tenant_id)) AND created_by = (SELECT auth.uid()) AND status = 'queued');

CREATE POLICY ai_eval_results_staff_select ON public.ai_eval_results
  FOR SELECT TO authenticated USING ((SELECT public.is_staff_of(tenant_id)));

-- 5. Real-usage metrics per version ------------------------------------------
-- SECURITY INVOKER: RLS on lessons_ai_task_messages and ai_config_versions
-- decides what the caller sees (staff of the lesson's tenant).

CREATE OR REPLACE FUNCTION public.lesson_task_version_metrics(_lesson_id bigint)
RETURNS TABLE (
  version_id uuid,
  version_no integer,
  created_at timestamptz,
  students integer,
  completed integer,
  median_turns_to_complete numeric,
  abandoned integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH msgs AS (
    SELECT m.user_id, m.config_version_id AS v, m.sender, m.created_at, m.tool_invocations
      FROM lessons_ai_task_messages m
     WHERE m.lesson_id = _lesson_id AND m.config_version_id IS NOT NULL
  ),
  done AS (
    SELECT user_id, v, min(created_at) AS done_at
      FROM msgs
     WHERE sender = 'assistant'
       AND jsonb_typeof(tool_invocations) = 'array'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(tool_invocations) e
          WHERE e->>'toolName' = 'markLessonCompleted' AND e->'output'->>'success' = 'true'
       )
     GROUP BY user_id, v
  ),
  per AS (
    SELECT m.user_id, m.v, d.done_at,
           count(*) FILTER (WHERE m.sender = 'user' AND (d.done_at IS NULL OR m.created_at <= d.done_at)) AS turns,
           max(m.created_at) AS last_at
      FROM msgs m
      LEFT JOIN done d ON d.user_id = m.user_id AND d.v = m.v
     GROUP BY m.user_id, m.v, d.done_at
  )
  SELECT ver.id, ver.version_no, ver.created_at,
         count(per.user_id)::integer,
         count(per.done_at)::integer,
         (percentile_cont(0.5) WITHIN GROUP (ORDER BY per.turns) FILTER (WHERE per.done_at IS NOT NULL))::numeric,
         (count(*) FILTER (WHERE per.user_id IS NOT NULL AND per.done_at IS NULL AND per.last_at < now() - interval '48 hours'))::integer
    FROM ai_config_versions ver
    LEFT JOIN per ON per.v = ver.id
   WHERE ver.target_type = 'lesson_ai_task' AND ver.target_id = _lesson_id
   GROUP BY ver.id, ver.version_no, ver.created_at
   ORDER BY ver.version_no DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.lesson_task_version_metrics(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_task_version_metrics(bigint) TO authenticated;
