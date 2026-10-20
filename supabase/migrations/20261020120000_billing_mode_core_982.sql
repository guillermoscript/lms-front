-- Issue #982 — tenants.billing_mode: paid | comped | internal (core, SQL half).
-- Design: docs/INTERNAL_COMPED_SCHOOLS.md. TS twin of the fee rule:
-- lib/billing/effective-fee.ts (keep identical).
--
--   paid     the plan is the plan; fee = revenue_splits (100 - school_percentage, else 20).
--   comped   a super admin gave the school a plan for free: fee = fee_percent_override ?? 0,
--            sales are never blocked (notify only), optional comped_until.
--   internal a platform-owned school: fee 0, unlimited, never suspended, never blocked.
--
-- What this migration does, in order:
--   1. tenants: billing_mode + comped_* + fee_percent_override + comped_notice_sent.
--   2. tenant_billing_mode_log (super-admin read, trigger-written) + trigger on tenants.
--   3. Data: platform tenant -> internal; plan_override schools -> comped; fee-exempt
--      schools -> comped. DECISION: schools that were fee-exempt (tenant_fee_standing.
--      enforcement_exempt) become `comped` with fee_percent_override preserving the rate
--      they pay today (100 - revenue_splits.school_percentage, default 20 when no row),
--      so their fee does NOT change; likewise for plan_override schools. comped = never
--      blocked, which is exactly what the exemption did. Nothing touches `transactions`.
--   4. effective_school_percentage(tenant) and its three consumers: set_transaction_split_
--      snapshot, platform_fee_ledger, get_platform_revenue (a snapshot still wins in the
--      last two).
--   5. is_tenant_sales_blocked: only `paid` schools can be blocked. Drops
--      set_tenant_fee_exemption + tenant_fee_standing exemption columns/CHECK.
--      (platform_fee_audit_log.action still lists exemption_set/_cleared: harmless.)
--   6. tenant_plan_limit / get_plan_features: internal unlimited; missing platform_plans
--      row -> comped/internal use `enterprise`, paid fails closed (limit 0 / '{}').
--   7. has_course_access: an internal school is never cut off; stale cutoffs cleared.
--   8. A real paid subscription (confirm_platform_payment_request,
--      promote_platform_subscription_switch) converts comped -> paid instead of clearing
--      plan_override_*; downgrade_platform_subscription_if_current skips non-paid schools.
--      (handle_manual_subscription_expiry was dropped in 20260719130000: the TS cron owns
--      expiry and must skip billing_mode <> 'paid' itself.)
--   9. Drops platform_subscriptions.plan_override_at / plan_override_by + their index.
--
-- SAFETY. Additive until step 5/9, which drop columns after their data is migrated in
-- this same transaction (Supabase wraps each migration file in one). Replaced functions
-- are CREATE OR REPLACE with their full latest bodies; grants are re-stated.
-- Rollback (partial, see file): rollback/20261020120000_billing_mode_core_982.down.sql.

-- ─── 1. tenants columns ─────────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS comped_until timestamptz,
  ADD COLUMN IF NOT EXISTS comped_reason text,
  ADD COLUMN IF NOT EXISTS comped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comped_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_percent_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS comped_notice_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_billing_mode_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_billing_mode_check
  CHECK (billing_mode IN ('paid', 'comped', 'internal'));

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_fee_percent_override_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_fee_percent_override_check
  CHECK (fee_percent_override IS NULL OR (fee_percent_override >= 0 AND fee_percent_override <= 100));

COMMENT ON COLUMN public.tenants.billing_mode IS
  'Issue #982: paid (default) | comped (free plan granted by a super admin; fee = fee_percent_override, never blocked) | internal (platform-owned: fee 0, unlimited, never suspended).';
COMMENT ON COLUMN public.tenants.fee_percent_override IS
  'Issue #982: platform fee % for a comped school (NULL = 0). Ignored for paid / internal.';
COMMENT ON COLUMN public.tenants.comped_notice_sent IS
  'Issue #982: which comp-expiry notices were already sent, e.g. {"7d": "<iso>", "0d": "<iso>"}.';

-- ─── 2. Audit log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_billing_mode_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  old_mode text,
  new_mode text NOT NULL,
  fee_percent_override numeric(5,2),
  comped_until timestamptz,
  reason text,
  changed_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_billing_mode_log IS
  'Issue #982: append-only history of tenants.billing_mode / fee_percent_override / comped_until changes. Written only by trg_log_tenant_billing_mode (SECURITY DEFINER).';

CREATE INDEX IF NOT EXISTS idx_tenant_billing_mode_log_tenant
  ON public.tenant_billing_mode_log (tenant_id, created_at DESC);

ALTER TABLE public.tenant_billing_mode_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view billing mode log" ON public.tenant_billing_mode_log;
CREATE POLICY "Super admins can view billing mode log"
  ON public.tenant_billing_mode_log FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

REVOKE ALL ON TABLE public.tenant_billing_mode_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_billing_mode_log TO authenticated;
GRANT ALL ON TABLE public.tenant_billing_mode_log TO service_role;

CREATE OR REPLACE FUNCTION public.log_tenant_billing_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.billing_mode <> 'paid' THEN
      INSERT INTO tenant_billing_mode_log (tenant_id, old_mode, new_mode, fee_percent_override, comped_until, reason)
      VALUES (NEW.id, NULL, NEW.billing_mode, NEW.fee_percent_override, NEW.comped_until, NEW.comped_reason);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.billing_mode IS DISTINCT FROM OLD.billing_mode
     OR (NEW.billing_mode = 'comped'
         AND (NEW.fee_percent_override IS DISTINCT FROM OLD.fee_percent_override
              OR NEW.comped_until IS DISTINCT FROM OLD.comped_until)) THEN
    INSERT INTO tenant_billing_mode_log (tenant_id, old_mode, new_mode, fee_percent_override, comped_until, reason)
    VALUES (NEW.id, OLD.billing_mode, NEW.billing_mode, NEW.fee_percent_override, NEW.comped_until, NEW.comped_reason);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_tenant_billing_mode() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_tenant_billing_mode_update ON public.tenants;
CREATE TRIGGER trg_log_tenant_billing_mode_update
  AFTER UPDATE OF billing_mode, fee_percent_override, comped_until ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_billing_mode();

DROP TRIGGER IF EXISTS trg_log_tenant_billing_mode_insert ON public.tenants;
CREATE TRIGGER trg_log_tenant_billing_mode_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW WHEN (NEW.billing_mode <> 'paid')
  EXECUTE FUNCTION public.log_tenant_billing_mode();

-- ─── 3. Data migration ──────────────────────────────────────────────────────
-- Runs after the trigger so each change lands in the log. Order matters: the old
-- columns are read here and dropped in steps 5 / 9.

UPDATE public.tenants
SET billing_mode = 'internal', comped_reason = 'platform tenant', comped_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001' AND billing_mode = 'paid';

-- plan_override schools (forced plan, no Stripe change) -> comped, keeping today's fee.
UPDATE public.tenants t
SET billing_mode = 'comped',
    comped_reason = 'migrated from plan_override',
    comped_by = ps.plan_override_by,
    comped_at = ps.plan_override_at,
    fee_percent_override = LEAST(100, GREATEST(0, COALESCE(
      (SELECT 100 - rs.school_percentage FROM public.revenue_splits rs WHERE rs.tenant_id = t.id), 20)))
FROM public.platform_subscriptions ps
WHERE ps.tenant_id = t.id
  AND ps.plan_override_at IS NOT NULL
  AND t.id <> '00000000-0000-0000-0000-000000000001'
  AND t.billing_mode = 'paid';

-- fee-exempt schools not already marked -> comped, keeping today's fee.
UPDATE public.tenants t
SET billing_mode = 'comped',
    comped_reason = 'migrated from fee exemption',
    comped_by = s.exempt_set_by,
    comped_at = COALESCE(s.exempt_set_at, now()),
    fee_percent_override = LEAST(100, GREATEST(0, COALESCE(
      (SELECT 100 - rs.school_percentage FROM public.revenue_splits rs WHERE rs.tenant_id = t.id), 20)))
FROM public.tenant_fee_standing s
WHERE s.tenant_id = t.id
  AND s.enforcement_exempt
  AND t.id <> '00000000-0000-0000-0000-000000000001'
  AND t.billing_mode = 'paid';

-- ─── 4. effective_school_percentage + consumers ─────────────────────────────

-- SQL twin of effectiveSchoolPercentage() in lib/billing/effective-fee.ts.
CREATE OR REPLACE FUNCTION public.effective_school_percentage(_tenant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE t.billing_mode
    WHEN 'internal' THEN 100::numeric
    WHEN 'comped' THEN 100 - LEAST(100, GREATEST(0, COALESCE(t.fee_percent_override, 0)))
    ELSE COALESCE(
      (SELECT rs.school_percentage FROM revenue_splits rs WHERE rs.tenant_id = _tenant_id),
      80
    )
  END
  FROM (SELECT 1) d
  LEFT JOIN tenants t ON t.id = _tenant_id;
$function$;

COMMENT ON FUNCTION public.effective_school_percentage(uuid) IS
  'Issue #982: the school''s share of a student sale. internal -> 100; comped -> 100 - fee_percent_override (NULL = 0); paid or unknown tenant -> revenue_splits.school_percentage else 80. TS twin: lib/billing/effective-fee.ts.';

REVOKE EXECUTE ON FUNCTION public.effective_school_percentage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_school_percentage(uuid) TO service_role;

-- Body from 20260725110000_transaction_split_snapshot_backstop.sql; only the value source changed.
CREATE OR REPLACE FUNCTION public.set_transaction_split_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Already snapshotted: frozen. Restoring OLD rather than comparing-and-
    -- raising means a tampering UPDATE is neutralised instead of failing the
    -- whole webhook that happened to carry it.
    IF OLD.school_percentage_snapshot IS NOT NULL THEN
      NEW.school_percentage_snapshot := OLD.school_percentage_snapshot;
      RETURN NEW;
    END IF;

    -- Legacy NULL row. Fill it only if a provider is activating it right now;
    -- otherwise keep the documented NULL fallback and discard whatever the
    -- caller tried to put there.
    IF NEW.payment_provider IS NOT DISTINCT FROM OLD.payment_provider THEN
      NEW.school_percentage_snapshot := NULL;
      RETURN NEW;
    END IF;
  END IF;

  -- INSERT, or the legacy-row activation case above. Either way the value is
  -- computed here; anything the caller supplied is ignored.
  IF NEW.tenant_id IS NULL THEN
    NEW.school_percentage_snapshot := NULL;
    RETURN NEW;
  END IF;

  -- #982: billing_mode aware (internal 100, comped 100 - override, paid the
  -- revenue_splits row else 80). Was: COALESCE(revenue_splits.school_percentage, 80).
  NEW.school_percentage_snapshot := public.effective_school_percentage(NEW.tenant_id);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_transaction_split_snapshot() IS
  'Backstop for #496 (issue #512): owns transactions.school_percentage_snapshot. Computes it via effective_school_percentage() (#982: billing_mode aware) on INSERT and freezes it on UPDATE, so neither an insert path that forgets nor a client that tampers can affect the payout computation. Legacy NULL rows are filled only when a provider activates them (payment_provider changing), never on an incidental update.';

-- Body from 20261009100000_platform_fee_ledger_929.sql; only the fallback pct source changed
-- (a transaction snapshot still wins).
CREATE OR REPLACE FUNCTION public.platform_fee_ledger(_tenant_id uuid, _accrued_before timestamptz DEFAULT NULL)
RETURNS TABLE (currency text, accrued numeric, paid numeric, sales integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT COALESCE(
      (SELECT hyperinflation_currencies FROM platform_fee_config WHERE id),
      '{VES}'::text[]
    ) AS hyper
  ),
  split AS (
    SELECT COALESCE(
      public.effective_school_percentage(_tenant_id),
      80
    ) AS pct
  ),
  src_rows AS (
    SELECT
      upper(COALESCE(t.currency::text, 'usd')) AS src,
      t.amount,
      GREATEST(t.amount - COALESCE(t.refunded_amount, 0), 0) AS kept,
      t.usd_amount,
      COALESCE(t.school_percentage_snapshot, split.pct) AS pct
    FROM transactions t, split
    WHERE t.tenant_id = _tenant_id
      AND t.payment_provider IN ('manual', 'binance_personal')
      AND t.status = 'successful'
      AND t.amount > 0
      AND (_accrued_before IS NULL OR t.transaction_date < _accrued_before)
  ),
  based AS (
    SELECT
      CASE WHEN r.src = ANY (cfg.hyper) AND r.usd_amount IS NOT NULL THEN 'USD' ELSE r.src END AS bucket,
      CASE WHEN r.src = ANY (cfg.hyper) AND r.usd_amount IS NOT NULL
           THEN round(r.usd_amount * r.kept / r.amount, 2)
           ELSE r.kept END AS base,
      r.pct
    FROM src_rows r, cfg
    WHERE r.kept > 0.005
  ),
  fees AS (
    SELECT bucket, sum(base - round(base * pct / 100, 2)) AS accrued, count(*)::integer AS sales
    FROM based
    GROUP BY bucket
  ),
  pays AS (
    SELECT p.currency AS bucket, sum(p.amount) AS paid
    FROM platform_fee_payments p
    WHERE p.tenant_id = _tenant_id
      AND p.status = 'succeeded'
    GROUP BY p.currency
  )
  SELECT
    COALESCE(f.bucket, p.bucket) AS currency,
    COALESCE(f.accrued, 0) AS accrued,
    COALESCE(p.paid, 0) AS paid,
    COALESCE(f.sales, 0) AS sales
  FROM fees f
  FULL JOIN pays p ON p.bucket = f.bucket
  ORDER BY 1;
$function$;

COMMENT ON FUNCTION public.platform_fee_ledger(uuid, timestamptz) IS
  'Issue #929: platform fee balance per ledger currency for one tenant (SQL mirror of lib/payments/platform-fee-owed.ts computeFeeBalances). Fallback pct is effective_school_percentage (#982). Service role only.';

-- Body from 20260727130000_partial_refunds_and_payout_idempotency.sql; only the fee source
-- changed (a transaction snapshot still wins).
create or replace function public.get_platform_revenue(
  _start timestamptz default null,
  _end   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_mrr  numeric;
  -- Mirror of ProviderCapabilities.bearsPlatformFee (lib/payments/types.ts).
  v_fee_bearing text[] := array['stripe', 'paypal', 'lemonsqueezy', 'binance', 'solana', 'solana_subs'];
begin
  -- SaaS MRR (schools paying the platform), normalized to monthly dollars.
  select coalesce(sum(
    case when ps.interval = 'yearly' then pp.price_yearly / 12.0
         else pp.price_monthly end
  ), 0)::numeric
  into v_mrr
  from platform_subscriptions ps
  join platform_plans pp on pp.plan_id = ps.plan_id
  where ps.status = 'active';

  with tx as (
    select
      t.tenant_id,
      greatest(t.amount - coalesce(t.refunded_amount, 0), 0) as amount,
      t.transaction_date,
      coalesce(
        t.payment_provider,
        case when t.stripe_payment_intent_id is not null then 'stripe' else 'manual' end
      ) as provider,
      -- Platform share = 100 - the school's share, snapshotted per transaction.
      100 - coalesce(t.school_percentage_snapshot, public.effective_school_percentage(t.tenant_id)) as platform_percentage
    from transactions t
    where t.status = 'successful'
      and (_start is null or t.transaction_date >= _start)
      and (_end   is null or t.transaction_date <= _end)
  ),
  tx_fee as (
    select
      tenant_id,
      amount,
      transaction_date,
      provider,
      case when provider = any(v_fee_bearing)
           then round(amount * platform_percentage / 100.0, 2)
           else 0 end as platform_fee
    from tx
  )
  select jsonb_build_object(
    'gmv',               (select coalesce(sum(amount), 0)       from tx_fee),
    'platform_fees',     (select coalesce(sum(platform_fee), 0) from tx_fee),
    'transaction_count', (select count(*)                       from tx_fee),
    'saas_mrr',          round(v_mrr, 2),
    'by_provider', (
      select coalesce(jsonb_agg(row order by row->>'fees' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'provider', provider,
          'gmv',   round(sum(amount), 2),
          'fees',  round(sum(platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee
        group by provider
      ) p
    ),
    'by_tenant', (
      select coalesce(jsonb_agg(row order by (row->>'fees')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'tenant_id', tf.tenant_id,
          'name',      coalesce(tn.name, 'Unknown'),
          'plan',      coalesce(tn.plan, 'free'),
          'gmv',   round(sum(tf.amount), 2),
          'fees',  round(sum(tf.platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee tf
        left join tenants tn on tn.id = tf.tenant_id
        group by tf.tenant_id, tn.name, tn.plan
      ) t
    ),
    'monthly', (
      select coalesce(jsonb_agg(row order by row->>'month'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'month', to_char(date_trunc('month', transaction_date), 'YYYY-MM'),
          'gmv',  round(sum(amount), 2),
          'fees', round(sum(platform_fee), 2)
        ) as row
        from tx_fee
        group by date_trunc('month', transaction_date)
        order by date_trunc('month', transaction_date)
      ) m
    )
  )
  into result;

  return result;
end;
$$;

comment on function public.get_platform_revenue(timestamptz, timestamptz) is
  'Platform super-admin revenue/fees aggregated across all tenants: GMV net of refunds, computed platform fees (per-transaction snapshotted split, else effective_school_percentage; fee-bearing providers only), SaaS MRR, and by-provider/by-tenant/monthly breakdowns. Called by /platform/revenue.';

-- ─── 5. Fee blocking: only paid schools ─────────────────────────────────────
-- Replaces the NOT enforcement_exempt clause (20261009130000). comped = notify only,
-- internal = never. Grants unchanged (service_role).

CREATE OR REPLACE FUNCTION public.is_tenant_sales_blocked(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT c.enforcement_mode = 'enforce' FROM platform_fee_config c WHERE c.id),
    false
  )
  AND EXISTS (
    SELECT 1 FROM tenant_fee_standing s
    WHERE s.tenant_id = _tenant_id
      AND s.blocked_at IS NOT NULL
  )
  AND (SELECT t.billing_mode FROM tenants t WHERE t.id = _tenant_id) = 'paid';
$function$;

COMMENT ON FUNCTION public.is_tenant_sales_blocked(uuid) IS
  'Issue #929/#982: true only when platform_fee_config.enforcement_mode = enforce AND tenant_fee_standing.blocked_at is set AND tenants.billing_mode = paid (comped = notify only, internal never). Gates NEW sales only; never course access (D5).';

DROP FUNCTION IF EXISTS public.set_tenant_fee_exemption(uuid, boolean, uuid, text);

ALTER TABLE public.tenant_fee_standing DROP CONSTRAINT IF EXISTS tenant_fee_standing_exempt_not_blocked;
ALTER TABLE public.tenant_fee_standing
  DROP COLUMN IF EXISTS enforcement_exempt,
  DROP COLUMN IF EXISTS exempt_reason,
  DROP COLUMN IF EXISTS exempt_set_by,
  DROP COLUMN IF EXISTS exempt_set_at;

-- ─── 6. Plan limits / features ──────────────────────────────────────────────
-- Bodies from 20260901120000_plan_limit_db_triggers.sql and
-- 20261003120000_get_plan_features_ignores_is_active_898.sql.
--   internal            -> unlimited (-1), never hits plan-limit triggers.
--   plan row missing    -> comped uses the `enterprise` row; paid fails closed (0 / '{}').
--   tenant missing      -> NULL (as before).

CREATE OR REPLACE FUNCTION public.tenant_plan_limit(_tenant_id uuid, _key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN t.billing_mode = 'internal' THEN -1
           WHEN pp.plan_id IS NULL THEN 0
           WHEN jsonb_typeof(pp.limits -> _key) = 'number'
             THEN (pp.limits ->> _key)::numeric::integer
           ELSE -1
         END
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.platform_plans p
    WHERE p.slug = COALESCE(t.plan, 'free')
       OR (t.billing_mode = 'comped' AND p.slug = 'enterprise')
    ORDER BY (p.slug = COALESCE(t.plan, 'free')) DESC
    LIMIT 1
  ) pp ON true
  WHERE t.id = _tenant_id;
$$;

COMMENT ON FUNCTION public.tenant_plan_limit(uuid, text) IS
  'Plan limit for a tenant resolved through tenants.plan → platform_plans.limits. -1 = unlimited (always for internal); a missing plan row resolves to enterprise for comped and to 0 (fail closed) for paid; NULL when the tenant does not exist. Issues #658, #982.';

REVOKE ALL ON FUNCTION public.tenant_plan_limit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_plan_limit(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_plan_features(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_slug varchar;
  _mode text;
  _result jsonb;
BEGIN
  SELECT plan, billing_mode INTO _plan_slug, _mode FROM public.tenants WHERE id = _tenant_id;
  _plan_slug := COALESCE(_plan_slug, 'free');

  -- No is_active filter: a retired plan still governs its subscribers.
  SELECT jsonb_build_object(
    'plan', pp.slug,
    'plan_name', pp.name,
    'features', pp.features,
    'limits', pp.limits,
    'transaction_fee_percent', pp.transaction_fee_percent
  ) INTO _result
  FROM public.platform_plans pp
  WHERE pp.slug = _plan_slug;

  -- #982: a slug with no row falls back to `enterprise` for comped / internal schools.
  -- A paid school gets '{}' (fail closed); the old free-row fallback is gone.
  IF _result IS NULL AND _mode IN ('comped', 'internal') THEN
    SELECT jsonb_build_object(
      'plan', pp.slug,
      'plan_name', pp.name,
      'features', pp.features,
      'limits', pp.limits,
      'transaction_fee_percent', pp.transaction_fee_percent
    ) INTO _result
    FROM public.platform_plans pp
    WHERE pp.slug = 'enterprise';
  END IF;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_plan_features(uuid) IS
  'Plan slug, name, features, limits and fee for a tenant, resolved through tenants.plan → platform_plans with no is_active filter. A slug with no row resolves to the enterprise row for comped / internal schools and to {} for paid ones. #898, #982.';

-- ─── 7. Course access: internal is never suspended ──────────────────────────
-- Body from 20260724130000_access_cutoff_enforcement.sql.

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    JOIN tenants t ON t.id = e.tenant_id
    WHERE e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND (t.access_cutoff_at IS NULL OR t.access_cutoff_at > now() OR t.billing_mode = 'internal')
  );
$function$;

UPDATE public.tenants SET access_cutoff_at = NULL
WHERE billing_mode = 'internal' AND access_cutoff_at IS NOT NULL;

-- ─── 8. Real paid subscription converts comped -> paid ──────────────────────
-- Replaces clearing platform_subscriptions.plan_override_*.

-- Bodies from 20260808154118_safe_platform_subscription_switches.sql (promote, downgrade)
-- and 20260808182924_transactional_manual_payment_confirmation.sql (confirm).
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
      updated_at = _now
  WHERE subscription_id = _current.subscription_id;

  UPDATE public.tenants
  SET plan = _plan_slug,
      billing_status = _target_status,
      billing_period_end = _target_period_end,
      updated_at = _now
  WHERE id = _tenant_id;

  -- #982: a real paid subscription converts a comped school to paid. internal is untouched.
  UPDATE public.tenants
  SET billing_mode = 'paid', comped_until = NULL, comped_reason = NULL,
      comped_by = NULL, comped_at = NULL, fee_percent_override = NULL
  WHERE id = _tenant_id AND billing_mode = 'comped';

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

  -- #982: only `paid` schools are auto-downgraded; comped / internal are managed by a super admin.
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND billing_mode <> 'paid') THEN
    RETURN NULL;
  END IF;

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


create or replace function public.confirm_platform_payment_request(
  _request_id uuid,
  _confirmed_by uuid
)
returns table (
  applied boolean,
  tenant_id uuid,
  switch_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.platform_payment_requests%rowtype;
  subscription_row public.platform_subscriptions%rowtype;
  plan_slug text;
  platform_fee numeric;
  start_at timestamptz;
  end_at timestamptz;
  promoted boolean;
  confirmed_at_value timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.super_admins sa
    where sa.user_id = _confirmed_by
  ) then
    raise exception 'Only super admins can confirm payments'
      using errcode = '42501';
  end if;

  select ppr.* into request_row
  from public.platform_payment_requests ppr
  where ppr.request_id = _request_id
  for update;

  if not found then
    raise exception 'Payment request not found'
      using errcode = 'P0002';
  end if;

  -- The request row lock makes a concurrent winner visible before this replay
  -- branch runs. A completed request is always a no-op: never restamp the actor
  -- and never derive another paid period.
  if request_row.status = 'confirmed' then
    select ps.* into subscription_row
    from public.platform_subscriptions ps
    where ps.tenant_id = request_row.tenant_id;

    return query select
      false,
      request_row.tenant_id,
      request_row.switch_id,
      request_row.confirmed_period_start,
      request_row.confirmed_period_end,
      request_row.confirmed_by,
      request_row.confirmed_at;
    return;
  end if;

  if request_row.status = 'rejected' then
    raise exception 'Rejected payments cannot be confirmed'
      using errcode = 'P0001';
  end if;
  if request_row.status = 'expired' then
    raise exception 'Expired payments cannot be confirmed'
      using errcode = 'P0001';
  end if;
  if request_row.status not in ('pending', 'instructions_sent', 'payment_received') then
    raise exception 'Payment request status % cannot be confirmed', request_row.status
      using errcode = 'P0001';
  end if;
  if request_row.expires_at is not null and request_row.expires_at <= confirmed_at_value then
    raise exception 'Expired payments cannot be confirmed'
      using errcode = 'P0001';
  end if;

  select pp.slug, pp.transaction_fee_percent
  into plan_slug, platform_fee
  from public.platform_plans pp
  where pp.plan_id = request_row.plan_id;

  if not found or plan_slug is null or platform_fee is null then
    raise exception 'Payment request plan is invalid'
      using errcode = 'P0002';
  end if;

  -- This key is shared with apply_self_managed_platform_period. It serializes
  -- different requests for one tenant even when no subscription row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(request_row.tenant_id::text, 625));

  select ps.* into subscription_row
  from public.platform_subscriptions ps
  where ps.tenant_id = request_row.tenant_id
  for update;

  select p.period_start, p.period_end
  into start_at, end_at
  from public.calculate_platform_billing_period(
    subscription_row.current_period_end,
    request_row.interval,
    request_row.request_type = 'renewal',
    confirmed_at_value
  ) p;

  if request_row.switch_id is not null then
    select public.promote_platform_subscription_switch(
      request_row.switch_id,
      request_row.tenant_id,
      coalesce(request_row.payment_provider, 'manual'),
      null,
      null,
      request_row.plan_id,
      'active',
      request_row.interval,
      start_at,
      end_at
    ) into promoted;

    if not coalesce(promoted, false) then
      raise exception 'Subscription switch no longer matches the payment request'
        using errcode = 'P0001';
    end if;

    select ps.* into subscription_row
    from public.platform_subscriptions ps
    where ps.tenant_id = request_row.tenant_id;
  else
    insert into public.platform_subscriptions (
      tenant_id,
      plan_id,
      status,
      payment_provider,
      interval,
      current_period_start,
      current_period_end,
      grace_period_end,
      renewal_reminder_sent_at,
      cancel_at_period_end,
      canceled_at,
      updated_at
    ) values (
      request_row.tenant_id,
      request_row.plan_id,
      'active',
      coalesce(request_row.payment_provider, 'manual'),
      request_row.interval,
      start_at,
      end_at,
      null,
      null,
      false,
      null,
      confirmed_at_value
    )
    on conflict on constraint platform_subscriptions_tenant_unique do update set
      plan_id = excluded.plan_id,
      status = excluded.status,
      payment_provider = excluded.payment_provider,
      interval = excluded.interval,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_period_end = null,
      renewal_reminder_sent_at = null,
      cancel_at_period_end = false,
      canceled_at = null,
      updated_at = excluded.updated_at
    returning * into subscription_row;

    update public.tenants t
    set plan = plan_slug,
        billing_status = 'active',
        billing_period_end = end_at,
        updated_at = confirmed_at_value
    where t.id = request_row.tenant_id;

    if not found then
      raise exception 'Payment request tenant not found'
        using errcode = 'P0002';
    end if;

    -- #982: a real paid period converts a comped school to paid. internal is untouched.
    update public.tenants t
    set billing_mode = 'paid', comped_until = null, comped_reason = null,
        comped_by = null, comped_at = null, fee_percent_override = null
    where t.id = request_row.tenant_id and t.billing_mode = 'comped';

    insert into public.revenue_splits (
      tenant_id,
      platform_percentage,
      school_percentage,
      updated_at
    ) values (
      request_row.tenant_id,
      platform_fee,
      100 - platform_fee,
      confirmed_at_value
    )
    on conflict on constraint revenue_splits_tenant_unique do update set
      platform_percentage = excluded.platform_percentage,
      school_percentage = excluded.school_percentage,
      updated_at = excluded.updated_at;
  end if;

  update public.platform_payment_requests ppr
  set status = 'confirmed',
      confirmed_by = _confirmed_by,
      confirmed_at = confirmed_at_value,
      confirmed_period_start = subscription_row.current_period_start,
      confirmed_period_end = subscription_row.current_period_end,
      updated_at = confirmed_at_value
  where ppr.request_id = request_row.request_id;

  return query select
    true,
    request_row.tenant_id,
    request_row.switch_id,
    subscription_row.current_period_start,
    subscription_row.current_period_end,
    _confirmed_by,
    confirmed_at_value;
end;
$$;


-- Grants as in the source migrations (service role only).
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

REVOKE ALL ON FUNCTION public.confirm_platform_payment_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_platform_payment_request(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.platform_fee_ledger(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_fee_ledger(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_platform_revenue(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_revenue(timestamptz, timestamptz) TO service_role;

-- ─── 9. Drop plan_override_* (data already moved to billing_mode in step 3) ─

DROP INDEX IF EXISTS public.idx_platform_subscriptions_plan_override;
ALTER TABLE public.platform_subscriptions
  DROP COLUMN IF EXISTS plan_override_at,
  DROP COLUMN IF EXISTS plan_override_by;
