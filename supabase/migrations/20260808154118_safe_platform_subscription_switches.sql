-- Safe provider switching for school -> platform subscriptions (issue #621).
--
-- `platform_subscriptions` intentionally remains the one CURRENT entitlement
-- row per tenant. This ledger retains the source identity while a replacement
-- is pending and until source-provider cancellation has converged.

CREATE TABLE public.platform_subscription_switches (
  switch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_subscription_id UUID NOT NULL REFERENCES public.platform_subscriptions(subscription_id),
  source_plan_id UUID NOT NULL REFERENCES public.platform_plans(plan_id),
  source_payment_provider TEXT NOT NULL CHECK (source_payment_provider IN (
    'stripe', 'paypal', 'binance', 'binance_personal',
    'manual', 'lemonsqueezy', 'solana', 'solana_subs'
  )),
  source_provider_subscription_id TEXT,
  source_period_end TIMESTAMPTZ,
  target_plan_id UUID NOT NULL REFERENCES public.platform_plans(plan_id),
  target_payment_provider TEXT NOT NULL CHECK (target_payment_provider IN (
    'stripe', 'paypal', 'binance', 'binance_personal',
    'manual', 'lemonsqueezy', 'solana', 'solana_subs'
  )),
  target_interval TEXT NOT NULL CHECK (target_interval IN ('monthly', 'yearly')),
  target_provider_subscription_id TEXT,
  target_checkout_reference TEXT,
  state TEXT NOT NULL DEFAULT 'pending_activation'
    CHECK (state IN (
      'pending_activation', 'cancellation_pending', 'cancellation_retry',
      'cancellation_scheduled', 'completed', 'failed', 'abandoned'
    )),
  source_cancel_mode TEXT CHECK (source_cancel_mode IN ('none', 'immediate', 'period_end')),
  source_cancel_effective_at TIMESTAMPTZ,
  cancel_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cancel_attempts >= 0),
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_payment_provider <> target_payment_provider)
);

CREATE UNIQUE INDEX platform_subscription_switches_one_open_per_tenant
  ON public.platform_subscription_switches(tenant_id)
  WHERE state IN (
    'pending_activation', 'cancellation_pending', 'cancellation_retry'
  );

CREATE UNIQUE INDEX platform_subscription_switches_target_identity
  ON public.platform_subscription_switches(target_payment_provider, target_provider_subscription_id)
  WHERE target_provider_subscription_id IS NOT NULL;

CREATE INDEX platform_subscription_switches_source_identity
  ON public.platform_subscription_switches(source_payment_provider, source_provider_subscription_id)
  WHERE source_provider_subscription_id IS NOT NULL;

CREATE INDEX platform_subscription_switches_retry
  ON public.platform_subscription_switches(next_retry_at)
  WHERE state IN ('cancellation_pending', 'cancellation_retry');

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_provider_identity_unique
  ON public.platform_subscriptions(payment_provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE public.platform_subscription_switches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view own subscription switches"
  ON public.platform_subscription_switches FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

GRANT SELECT ON public.platform_subscription_switches TO authenticated;
GRANT ALL ON public.platform_subscription_switches TO service_role;
REVOKE ALL ON public.platform_subscription_switches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.platform_subscription_switches FROM authenticated;

ALTER TABLE public.platform_payment_requests
  ADD COLUMN switch_id UUID REFERENCES public.platform_subscription_switches(switch_id) ON DELETE SET NULL;

CREATE INDEX platform_payment_requests_switch_id
  ON public.platform_payment_requests(switch_id)
  WHERE switch_id IS NOT NULL;

-- Promote only while the ledger's source snapshot still matches the tenant's
-- current row. The row locks serialize replacement activation against an exact
-- terminal downgrade. Replays after promotion return true without extending a
-- period or replacing the source snapshot again.
CREATE OR REPLACE FUNCTION public.promote_platform_subscription_switch(
  _switch_id UUID,
  _tenant_id UUID,
  _target_payment_provider TEXT,
  _target_provider_subscription_id TEXT,
  _target_provider_customer_id TEXT,
  _target_plan_id UUID,
  _target_status TEXT,
  _target_interval TEXT,
  _target_period_start TIMESTAMPTZ,
  _target_period_end TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _switch public.platform_subscription_switches%ROWTYPE;
  _current public.platform_subscriptions%ROWTYPE;
  _plan_slug TEXT;
  _platform_fee NUMERIC;
  _now TIMESTAMPTZ := now();
BEGIN
  -- Lock the tenant's current entitlement first. Every promotion and exact
  -- terminal downgrade uses this lock order, avoiding a revival/new-checkout
  -- deadlock when both payments arrive together.
  SELECT * INTO _current
  FROM public.platform_subscriptions
  WHERE tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO _switch
  FROM public.platform_subscription_switches
  WHERE switch_id = _switch_id AND tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR _switch.target_payment_provider <> _target_payment_provider
     OR _switch.target_plan_id <> _target_plan_id
     OR _switch.target_interval <> _target_interval THEN
    RETURN FALSE;
  END IF;

  IF _switch.state IN ('cancellation_pending', 'cancellation_retry', 'cancellation_scheduled', 'completed') THEN
    RETURN _switch.target_provider_subscription_id IS NOT DISTINCT FROM _target_provider_subscription_id;
  END IF;
  IF _switch.state NOT IN ('pending_activation', 'abandoned') THEN
    RETURN FALSE;
  END IF;

  IF _current.subscription_id <> _switch.source_subscription_id
     OR _current.payment_provider <> _switch.source_payment_provider
     OR _current.provider_subscription_id IS DISTINCT FROM _switch.source_provider_subscription_id THEN
    RETURN FALSE;
  END IF;

  -- A provider may settle after its checkout intent expired. The validated
  -- payment wins while the original source is still current; release any newer
  -- unpaid intent so reviving this switch cannot violate the open-switch index.
  IF _switch.state = 'abandoned' THEN
    UPDATE public.platform_subscription_switches
    SET state = 'abandoned', updated_at = _now
    WHERE tenant_id = _tenant_id
      AND switch_id <> _switch_id
      AND state = 'pending_activation';
  END IF;

  SELECT slug, transaction_fee_percent INTO _plan_slug, _platform_fee
  FROM public.platform_plans
  WHERE plan_id = _target_plan_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE public.platform_subscriptions
  SET plan_id = _target_plan_id,
      payment_provider = _target_payment_provider,
      provider_subscription_id = _target_provider_subscription_id,
      provider_customer_id = _target_provider_customer_id,
      status = _target_status,
      interval = _target_interval,
      current_period_start = _target_period_start,
      current_period_end = _target_period_end,
      cancel_at_period_end = FALSE,
      canceled_at = NULL,
      grace_period_end = NULL,
      renewal_reminder_sent_at = NULL,
      plan_override_at = NULL,
      plan_override_by = NULL,
      updated_at = _now
  WHERE subscription_id = _current.subscription_id;

  UPDATE public.tenants
  SET plan = _plan_slug,
      billing_status = _target_status,
      billing_period_end = _target_period_end,
      updated_at = _now
  WHERE id = _tenant_id;

  INSERT INTO public.revenue_splits (
    tenant_id, platform_percentage, school_percentage, updated_at
  ) VALUES (
    _tenant_id, _platform_fee, 100 - _platform_fee, _now
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET platform_percentage = EXCLUDED.platform_percentage,
      school_percentage = EXCLUDED.school_percentage,
      updated_at = EXCLUDED.updated_at;

  UPDATE public.platform_subscription_switches
  SET target_provider_subscription_id = _target_provider_subscription_id,
      state = 'cancellation_pending',
      activated_at = COALESCE(activated_at, _now),
      next_retry_at = _now,
      last_error = NULL,
      updated_at = _now
  WHERE switch_id = _switch_id;

  RETURN TRUE;
END;
$$;

-- Terminal webhooks may downgrade only the exact provider subscription that is
-- current while this function holds the row lock. A delayed source event
-- returns NULL and cannot touch tenant or revenue-split state.
CREATE OR REPLACE FUNCTION public.downgrade_platform_subscription_if_current(
  _tenant_id UUID,
  _payment_provider TEXT,
  _provider_subscription_id TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _current public.platform_subscriptions%ROWTYPE;
  _platform_fee NUMERIC;
  _now TIMESTAMPTZ := now();
BEGIN
  IF _provider_subscription_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO _current
  FROM public.platform_subscriptions
  WHERE tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR _current.payment_provider <> _payment_provider
     OR _current.provider_subscription_id IS DISTINCT FROM _provider_subscription_id THEN
    RETURN NULL;
  END IF;

  SELECT transaction_fee_percent INTO _platform_fee
  FROM public.platform_plans
  WHERE slug = 'free';
  _platform_fee := COALESCE(_platform_fee, 10);

  UPDATE public.platform_subscriptions
  SET status = 'canceled', canceled_at = _now, updated_at = _now
  WHERE subscription_id = _current.subscription_id;

  UPDATE public.tenants
  SET plan = 'free', billing_status = 'free', billing_period_end = NULL, updated_at = _now
  WHERE id = _tenant_id;

  INSERT INTO public.revenue_splits (
    tenant_id, platform_percentage, school_percentage, updated_at
  ) VALUES (
    _tenant_id, _platform_fee, 100 - _platform_fee, _now
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET platform_percentage = EXCLUDED.platform_percentage,
      school_percentage = EXCLUDED.school_percentage,
      updated_at = EXCLUDED.updated_at;

  RETURN _platform_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_platform_subscription_switch(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_platform_subscription_switch(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.downgrade_platform_subscription_if_current(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.downgrade_platform_subscription_if_current(UUID, TEXT, TEXT)
  TO service_role;
