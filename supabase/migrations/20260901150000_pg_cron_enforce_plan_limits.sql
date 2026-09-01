-- Issue #660: a scheduler that actually runs `enforce-plan-limits`.
--
-- `.github/workflows/cron.yml` schedules the route at `0 3 * * *`, but GitHub
-- throttles low-frequency schedules so hard that the daily jobs have never been
-- observed firing in production (only ~12 of 144 daily `*/10` ticks do). The
-- access-cutoff reminder ladder therefore never sent a single email.
--
-- pg_cron already runs `league-weekly-rollover` inside the database; this makes
-- it the primary scheduler for `enforce-plan-limits` too. The sweep itself
-- stays in the Next.js route (it sends emails and reconciles through the app's
-- own code), so the database reaches it over HTTP with pg_net, authenticating
-- with the same `CRON_SECRET` the GitHub workflow uses — read from Supabase
-- Vault, never stored in a table or a function body.
--
--   Vault secrets (create once per environment, see docs/CRON_RUNBOOK.md):
--     select vault.create_secret('<CRON_SECRET>',          'cron_secret');
--     select vault.create_secret('https://preciopana.com', 'cron_base_url');
--
-- Every invocation is written to `cron_runs` (route, when, pg_net request id),
-- and `record_cron_run_results()` — itself on pg_cron every 5 minutes — copies
-- the HTTP status and body back from `net._http_response` (pg_net keeps those
-- for ~6 hours). `/platform/billing-health` shows the last sweep from that
-- ledger, so "is enforcement alive" is a question the UI can answer.
--
-- Both schedules are guarded on pg_cron being installed so the migration also
-- applies to a stack without it; with the Vault secrets missing the invoker
-- records a run with `error` set and raises a NOTICE instead of failing, so a
-- fresh environment is never broken by an unconfigured scheduler.
--
-- The GitHub schedule stays as the fallback, exactly like `league-rollover`:
-- the route is idempotent, and a second daily run is cheaper than none.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id            bigserial PRIMARY KEY,
  route         text        NOT NULL,
  scheduler     text        NOT NULL DEFAULT 'pg_cron',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  request_id    bigint,
  status_code   integer,
  response      jsonb,
  error         text,
  completed_at  timestamptz
);

COMMENT ON TABLE public.cron_runs IS
  'One row per scheduled invocation of an /api/cron/* route from pg_cron (issue #660). status/response are filled in asynchronously by record_cron_run_results().';

CREATE INDEX IF NOT EXISTS idx_cron_runs_route_requested
  ON public.cron_runs (route, requested_at DESC);

-- Operators and the service role only. No policies: the platform page reads it
-- through the admin client behind checkSuperAdmin().
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cron_runs FROM anon, authenticated;
GRANT SELECT ON TABLE public.cron_runs TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Invoker
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_cron_route(_route text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret   text;
  _base_url text;
  _request  bigint;
  _run_id   bigint;
BEGIN
  IF _route IS NULL OR _route !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'invoke_cron_route: invalid route %', _route;
  END IF;

  SELECT decrypted_secret INTO _secret   FROM vault.decrypted_secrets WHERE name = 'cron_secret'   LIMIT 1;
  SELECT decrypted_secret INTO _base_url FROM vault.decrypted_secrets WHERE name = 'cron_base_url' LIMIT 1;

  INSERT INTO public.cron_runs (route) VALUES (_route) RETURNING id INTO _run_id;

  IF _secret IS NULL OR _base_url IS NULL THEN
    UPDATE public.cron_runs
       SET error = 'vault secrets cron_secret / cron_base_url not configured',
           completed_at = now()
     WHERE id = _run_id;
    RAISE NOTICE 'invoke_cron_route(%): vault secrets missing, nothing invoked', _route;
    RETURN _run_id;
  END IF;

  -- Async: pg_net's worker performs the request; the response lands in
  -- net._http_response keyed by this id. A sweep over every tenant can take a
  -- while (20 tenants ≈ 11 s in prod), so the timeout is generous.
  SELECT net.http_get(
           url                  := rtrim(_base_url, '/') || '/api/cron/' || _route,
           headers              := jsonb_build_object('Authorization', 'Bearer ' || _secret),
           timeout_milliseconds := 300000
         )
    INTO _request;

  UPDATE public.cron_runs SET request_id = _request WHERE id = _run_id;
  RETURN _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_cron_route(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Result recorder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_cron_run_results()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.cron_runs r
     SET status_code  = h.status_code,
         response     = CASE
                          WHEN h.content IS NULL THEN NULL
                          WHEN h.content ~ '^\s*[\[{]' THEN
                            (SELECT j FROM (SELECT h.content::jsonb AS j) s)
                          ELSE jsonb_build_object('raw', left(h.content, 2000))
                        END,
         error        = CASE
                          WHEN h.timed_out THEN 'timed out'
                          ELSE h.error_msg
                        END,
         completed_at = now()
    FROM net._http_response h
   WHERE h.id = r.request_id
     AND r.completed_at IS NULL;
  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- pg_net drops responses after ~6 h; a run older than that with no response
  -- will never get one. Close it so the page does not show it as "running".
  UPDATE public.cron_runs
     SET error = 'no response recorded (pg_net response expired or worker down)',
         completed_at = now()
   WHERE completed_at IS NULL
     AND requested_at < now() - interval '6 hours';

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cron_run_results() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Schedules (pg_cron primary; cron.yml keeps the same slot as fallback)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'enforce-plan-limits-daily',
      '0 3 * * *',
      $cron$SELECT public.invoke_cron_route('enforce-plan-limits')$cron$
    );
    PERFORM cron.schedule(
      'record-cron-run-results',
      '*/5 * * * *',
      $cron$SELECT public.record_cron_run_results()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; enforce-plan-limits stays on the GitHub schedule only';
  END IF;
END $$;
