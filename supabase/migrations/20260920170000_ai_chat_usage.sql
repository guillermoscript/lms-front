-- Issue #807: a durable AI chat budget that survives a deploy.
--
-- #804 added `aiChatLimiter` (20 turns/min/user, in-memory LRU) in front of
-- the lesson tutor, exercise coach and the two editor-preview chats. It is
-- only a burst brake: per server instance, reset on every deploy, no daily
-- ceiling, and `/api/chat/aristotle` was not covered at all.
--
-- This adds the durable layer underneath it:
--   * a per-user DAILY cap (`platform_plans.limits ->> 'max_ai_messages_per_day'`)
--   * a per-tenant MONTHLY budget (`... ->> 'max_ai_messages_per_month'`), summed
--     across every user in the tenant
-- resolved through `tenant_plan_limit()` (20260901120000, issue #658) — the
-- same "-1 or missing key = unlimited" rule every other plan limit follows.
--
-- One row per (tenant, user, day). The monthly budget is not a second
-- write path: it is `SUM(message_count)` over the tenant's rows for the
-- current month, so there is nothing to keep in sync. `increment_ai_chat_usage`
-- checks both caps and writes the increment in one SECURITY DEFINER call,
-- serialized with advisory locks (tenant+user, then tenant) so two concurrent
-- requests cannot both slip past a cap — same shape as
-- `assert_plan_limit_headroom` in 20260901120000.

CREATE TABLE public.ai_chat_usage (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, period_date)
);

COMMENT ON TABLE public.ai_chat_usage IS
  'One row per (tenant, user, UTC day) counting AI chat turns. Daily cap reads the row directly; the tenant-wide monthly budget is SUM(message_count) over the month. Written only through increment_ai_chat_usage(). Issue #807.';

-- The daily-cap read is covered by the primary key. The monthly-budget read
-- filters (tenant_id, period_date >= month_start) across every user in the
-- tenant, which the PK cannot serve efficiently (user_id sits between the two
-- columns in it) — a dedicated index keeps that a range scan, not a seq scan.
CREATE INDEX idx_ai_chat_usage_tenant_period
  ON public.ai_chat_usage (tenant_id, period_date);

ALTER TABLE public.ai_chat_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI chat usage"
  ON public.ai_chat_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Tenant admins can view their tenant's AI chat usage"
  ON public.ai_chat_usage FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = ai_chat_usage.tenant_id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    )
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

-- No INSERT/UPDATE policy for `authenticated` — every write goes through the
-- SECURITY DEFINER function below, same lockdown shape as `transactions` (#538).
GRANT SELECT ON public.ai_chat_usage TO authenticated;
GRANT ALL ON public.ai_chat_usage TO service_role;
REVOKE ALL ON public.ai_chat_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_chat_usage FROM authenticated;

-- ---------------------------------------------------------------------------
-- Check-and-increment, atomic. Returns whether the turn is allowed and the
-- usage/limit numbers a route can turn into a friendly 429 body.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_ai_chat_usage(_tenant_id UUID, _user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _daily_max INTEGER;
  _monthly_max INTEGER;
  _today DATE := (now() AT TIME ZONE 'utc')::date;
  _month_start DATE := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  _daily_used INTEGER;
  _monthly_used INTEGER;
  _uid UUID := auth.uid();
BEGIN
  IF _tenant_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'increment_ai_chat_usage: tenant_id and user_id are required';
  END IF;

  -- A PostgREST-authenticated caller may only increment their OWN usage.
  -- service_role (no JWT, or the service JWT) is trusted, same guard as
  -- get_tenant_plan_usage in 20260901120000.
  IF auth.jwt() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND _uid IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'increment_ai_chat_usage: user_id must match the caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _daily_max := public.tenant_plan_limit(_tenant_id, 'max_ai_messages_per_day');
  _monthly_max := public.tenant_plan_limit(_tenant_id, 'max_ai_messages_per_month');

  -- Fixed lock order (tenant+user, then tenant) so this function never
  -- deadlocks against a concurrent call of itself.
  PERFORM pg_advisory_xact_lock(hashtext('ai_chat_usage:' || _tenant_id::text || ':' || _user_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('ai_chat_usage_tenant:' || _tenant_id::text));

  SELECT message_count INTO _daily_used
  FROM public.ai_chat_usage
  WHERE tenant_id = _tenant_id AND user_id = _user_id AND period_date = _today;
  _daily_used := COALESCE(_daily_used, 0);

  IF _daily_max IS NOT NULL AND _daily_max >= 0 AND _daily_used >= _daily_max THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'daily_limit',
      'daily_used', _daily_used, 'daily_max', _daily_max,
      'monthly_used', NULL, 'monthly_max', _monthly_max
    );
  END IF;

  SELECT COALESCE(SUM(message_count), 0) INTO _monthly_used
  FROM public.ai_chat_usage
  WHERE tenant_id = _tenant_id AND period_date >= _month_start;

  IF _monthly_max IS NOT NULL AND _monthly_max >= 0 AND _monthly_used >= _monthly_max THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'monthly_limit',
      'daily_used', _daily_used, 'daily_max', _daily_max,
      'monthly_used', _monthly_used, 'monthly_max', _monthly_max
    );
  END IF;

  INSERT INTO public.ai_chat_usage (tenant_id, user_id, period_date, message_count)
  VALUES (_tenant_id, _user_id, _today, 1)
  ON CONFLICT (tenant_id, user_id, period_date)
  DO UPDATE SET message_count = public.ai_chat_usage.message_count + 1, updated_at = now();

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'ok',
    'daily_used', _daily_used + 1, 'daily_max', _daily_max,
    'monthly_used', _monthly_used + 1, 'monthly_max', _monthly_max
  );
END;
$$;

COMMENT ON FUNCTION public.increment_ai_chat_usage(UUID, UUID) IS
  'Atomic check-and-increment of the per-user daily / per-tenant monthly AI chat budget. -1 or a missing limit key means unlimited. Issue #807.';

REVOKE ALL ON FUNCTION public.increment_ai_chat_usage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_chat_usage(UUID, UUID) TO authenticated, service_role;
