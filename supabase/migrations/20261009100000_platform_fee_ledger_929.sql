-- Issue #929 — platform fee ledger, foundation (wave 2, slicing steps 1-2).
-- Design: docs/PLATFORM_FEE_LEDGER_DESIGN.md (sections 2, 2.3, 3, 4.3, 6, 7, 8).
--
-- On rails where the buyer pays the school directly (`manual`,
-- `binance_personal`: ProviderCapabilities.bearsPlatformFee = false) the
-- platform never touches the money, so its commission becomes a balance the
-- school owes. Accruals are DERIVED from `transactions` (D1); this migration
-- stores only what cannot be derived:
--
--   platform_fee_config      single-row kill switch + tunables (super admin)
--   platform_fx_rates        daily USD rate per hyperinflation currency
--   transactions.fx_* /      insert-time USD snapshot for hyperinflation
--     usd_amount             currencies, frozen on UPDATE (like #512 / #927)
--   platform_fee_statements  frozen monthly NON-FISCAL statements (documents)
--   platform_fee_payments    money received against the balance
--   tenant_fee_standing      one row per tenant; blocked_at is the ONLY
--                            block signal (D8)
--
-- plus is_tenant_sales_blocked(), platform_fee_ledger() (SQL mirror of
-- lib/payments/platform-fee-owed.ts), reevaluate_tenant_fee_standing() (only
-- ever RECOVERS a tenant; never blocks) and request_type = 'fee' on
-- platform_payment_requests.
--
-- BEHAVIOUR. Nothing user-visible changes. No trigger on transactions INSERT
-- is created here: the sales-block trigger needs the renewal exemption (4.2a)
-- and ships with the gate PR. enforcement_mode defaults to 'notify_only', in
-- which is_tenant_sales_blocked() returns false for every tenant. No code
-- writes the new columns or tables yet.
--
-- D5. Nothing here is read by the course access check or the access grants
-- table, and nothing here references them. Paying students never lose access
-- over a school's fee debt
-- (tests/unit/fee-standing-access-contract.test.ts enforces this).
--
-- WRITES. Every new table is server-write-only, the stance of `transactions`
-- (#538/#528): `authenticated` gets SELECT (rows filtered by RLS) and nothing
-- else, except platform_fee_config, which super admins may UPDATE (kill switch,
-- 3 "Safety rails"). Server code writes with the service role.
--
-- SAFETY. Additive only. New transactions columns are nullable with no default
-- (metadata-only ALTER, no rewrite). New CHECKs on existing tables are NOT
-- VALID then VALIDATE (SHARE UPDATE EXCLUSIVE during the scan, so checkouts and
-- webhooks keep writing). Rollback: rollback/20261009100000_platform_fee_ledger_929.down.sql.

-- ─── 1. Config (single row, kill switch) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_fee_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforcement_mode text NOT NULL DEFAULT 'notify_only'
    CHECK (enforcement_mode IN ('off', 'notify_only', 'enforce')),
  -- FEE_GRACE_DAYS (decided, Q4): days after the due date before a block.
  fee_grace_days integer NOT NULL DEFAULT 7 CHECK (fee_grace_days >= 0),
  -- Never block a school over cents (decided default, Q4).
  min_blocking_balance numeric(10,2) NOT NULL DEFAULT 1.00 CHECK (min_blocking_balance >= 0),
  -- Converted to USD at sale time (decided, Q2). Upper-case ISO codes; never USD itself.
  hyperinflation_currencies text[] NOT NULL DEFAULT '{VES}'
    CHECK (
      array_to_string(hyperinflation_currencies, ',') ~ '^([A-Z]{3}(,[A-Z]{3})*)?$'
      AND NOT ('USD' = ANY (hyperinflation_currencies))
    ),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_fee_config IS
  'Issue #929: single-row platform fee ledger config. enforcement_mode is the kill switch: is_tenant_sales_blocked() returns false unless it is ''enforce''. Ship value notify_only; flip to enforce only after one real billing cycle (Q8). Super admin SELECT/UPDATE only.';

INSERT INTO public.platform_fee_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.stamp_platform_fee_config_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS before_platform_fee_config_update ON public.platform_fee_config;
CREATE TRIGGER before_platform_fee_config_update
  BEFORE UPDATE ON public.platform_fee_config
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_platform_fee_config_update();

ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;

-- Super admin = is_super_admin(), the pattern of the RLS sweep (20260830140000).

DROP POLICY IF EXISTS "Super admins can view platform fee config" ON public.platform_fee_config;
CREATE POLICY "Super admins can view platform fee config"
  ON public.platform_fee_config FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

DROP POLICY IF EXISTS "Super admins can update platform fee config" ON public.platform_fee_config;
CREATE POLICY "Super admins can update platform fee config"
  ON public.platform_fee_config FOR UPDATE TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

REVOKE ALL ON TABLE public.platform_fee_config FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_fee_config TO authenticated;
GRANT UPDATE (enforcement_mode, fee_grace_days, min_blocking_balance, hyperinflation_currencies)
  ON TABLE public.platform_fee_config TO authenticated;
GRANT ALL ON TABLE public.platform_fee_config TO service_role;

-- ─── 2. FX rates + insert-time snapshot on transactions ─────────────────────

CREATE TABLE IF NOT EXISTS public.platform_fx_rates (
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$' AND currency <> 'USD'),
  rate_date date NOT NULL,
  -- USD per 1 unit of `currency`.
  rate numeric NOT NULL CHECK (rate > 0),
  -- e.g. 'bcv' (official, proposed for VES). Which source is an owner call (Q2).
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, rate_date)
);

COMMENT ON TABLE public.platform_fx_rates IS
  'Issue #929: daily USD rate per hyperinflation currency, fetched server-side. The transaction insert copies the rate for its date (or the latest earlier one, source suffixed :stale) into transactions.fx_*; the ledger never re-converts.';

ALTER TABLE public.platform_fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view platform fx rates" ON public.platform_fx_rates;
CREATE POLICY "Super admins can view platform fx rates"
  ON public.platform_fx_rates FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

REVOKE ALL ON TABLE public.platform_fx_rates FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_fx_rates TO authenticated;
GRANT ALL ON TABLE public.platform_fx_rates TO service_role;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fx_rate_to_usd numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_source text,
  ADD COLUMN IF NOT EXISTS fx_rate_date date,
  ADD COLUMN IF NOT EXISTS usd_amount numeric(10,2);

COMMENT ON COLUMN public.transactions.fx_rate_to_usd IS
  'Issue #929: USD per 1 unit of `currency` at insert, hyperinflation currencies only (platform_fee_config). NULL otherwise. Frozen once written.';
COMMENT ON COLUMN public.transactions.fx_rate_source IS
  'Issue #929: where fx_rate_to_usd came from (e.g. bcv, or bcv:stale when the latest earlier rate was used). Frozen once written.';
COMMENT ON COLUMN public.transactions.fx_rate_date IS
  'Issue #929: the date of the platform_fx_rates row used. Frozen once written.';
COMMENT ON COLUMN public.transactions.usd_amount IS
  'Issue #929: `amount` in USD at fx_rate_to_usd, the platform fee ledger base for hyperinflation currencies. A partial refund is converted at this stored rate (usd_amount * (amount - refunded_amount) / amount), never re-converted. Frozen once written.';

-- All four together or none: a half-written snapshot cannot be priced.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_fx_snapshot_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_fx_snapshot_check CHECK (
    (fx_rate_to_usd IS NULL AND fx_rate_source IS NULL AND fx_rate_date IS NULL AND usd_amount IS NULL)
    OR (fx_rate_to_usd > 0 AND fx_rate_source IS NOT NULL AND fx_rate_date IS NOT NULL AND usd_amount >= 0)
  ) NOT VALID;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_fx_snapshot_check;

-- Frozen once written, like fee_bearer (#927): re-converting a historical sale
-- at another rate would re-price history. RAISE rather than silently keep OLD;
-- the WHEN clause means updates that do not change these columns never reach it.
-- authenticated has no UPDATE grant on these columns anyway (#528 column grants).
CREATE OR REPLACE FUNCTION public.freeze_transaction_fx_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'transactions fx snapshot is immutable once written (transaction %)', OLD.transaction_id
    USING ERRCODE = 'check_violation',
          HINT = 'fx_rate_to_usd/fx_rate_source/fx_rate_date/usd_amount are insert-time snapshots (issue #929).';
END;
$function$;

DROP TRIGGER IF EXISTS before_transaction_fx_snapshot_update ON public.transactions;
CREATE TRIGGER before_transaction_fx_snapshot_update
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (
    NEW.fx_rate_to_usd IS DISTINCT FROM OLD.fx_rate_to_usd
    OR NEW.fx_rate_source IS DISTINCT FROM OLD.fx_rate_source
    OR NEW.fx_rate_date IS DISTINCT FROM OLD.fx_rate_date
    OR NEW.usd_amount IS DISTINCT FROM OLD.usd_amount
  )
  EXECUTE FUNCTION public.freeze_transaction_fx_snapshot();

-- ─── 3. Statements (frozen monthly NON-FISCAL documents, 2.3 / 2.5) ─────────

CREATE TABLE IF NOT EXISTS public.platform_fee_statements (
  statement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  period_start date NOT NULL,
  period_end date NOT NULL,
  fee_amount numeric(10,2) NOT NULL CHECK (fee_amount >= 0),
  txn_count integer NOT NULL DEFAULT 0 CHECK (txn_count >= 0),
  -- Informational: refunds after a prior close show here as credit (never edited back).
  prior_adjustment numeric(10,2) NOT NULL DEFAULT 0,
  lines jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Internal reference, explicitly NOT a fiscal invoice number.
  statement_number text NOT NULL UNIQUE CHECK (statement_number ~ '^PF-[0-9]{6}-[0-9]+$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  issued_email_sent_at timestamptz,
  reminder_sent_at timestamptz,
  overdue_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (due_at >= period_end::timestamp AT TIME ZONE 'UTC'),
  -- Cron idempotency: one statement per tenant, currency and month.
  UNIQUE (tenant_id, currency, period_start),
  -- Target of the tenant-matching FK from platform_fee_payments.
  UNIQUE (statement_id, tenant_id)
);

COMMENT ON TABLE public.platform_fee_statements IS
  'Issue #929: frozen monthly NON-FISCAL statement of platform fees owed ("Statement, not a tax invoice"). A document, not the debt: the debt is the stateless ledger balance (D4). lines is frozen at close and is what the statement renders.';

CREATE INDEX IF NOT EXISTS idx_platform_fee_statements_tenant_due
  ON public.platform_fee_statements (tenant_id, due_at);

-- ─── 4. Payments (money received) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_fee_payments (
  payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Ledger bucket (USD for converted hyperinflation sales).
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  -- Platform billing rail slug, or 'waiver' (super-admin write-off, append-only).
  provider text NOT NULL CHECK (provider IN (
    'stripe', 'paypal', 'binance', 'binance_personal', 'manual',
    'lemonsqueezy', 'solana', 'solana_subs', 'waiver'
  )),
  provider_reference text,
  provider_charge_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  paid_at timestamptz,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Informational link only; there is no allocation logic (D4).
  statement_id uuid,
  idempotency_key text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'succeeded' OR paid_at IS NOT NULL),
  -- A payment can only point at a statement of its own tenant.
  FOREIGN KEY (statement_id, tenant_id)
    REFERENCES public.platform_fee_statements (statement_id, tenant_id)
);

COMMENT ON TABLE public.platform_fee_payments IS
  'Issue #929: platform fee payments received from a school. Only status = succeeded counts toward the balance; overpayment carries forward (amount > 0, no reverse rows). Server-write-only.';

-- Webhook / Solana idempotency: one provider charge settles one payment.
CREATE UNIQUE INDEX IF NOT EXISTS platform_fee_payments_provider_charge_unique
  ON public.platform_fee_payments (provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_fee_payments_tenant
  ON public.platform_fee_payments (tenant_id, currency, status);

-- ─── 5. Standing (one row per tenant; blocked_at is the only block signal) ──

CREATE TABLE IF NOT EXISTS public.tenant_fee_standing (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'reminded', 'overdue', 'blocked')),
  overdue_since timestamptz,
  blocked_at timestamptz,
  last_evaluated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- `state` is for UI and emails; it may never disagree with the signal (D8).
  CHECK ((blocked_at IS NOT NULL) = (state = 'blocked')),
  CHECK (state NOT IN ('overdue', 'blocked') OR overdue_since IS NOT NULL)
);

COMMENT ON TABLE public.tenant_fee_standing IS
  'Issue #929: platform fee standing per tenant. blocked_at IS NOT NULL is the ONLY thing the sales gate reads (D8), and only while platform_fee_config.enforcement_mode = enforce. Never read by the course access check (D5).';

-- ─── RLS + grants for the three tenant tables ───────────────────────────────

ALTER TABLE public.platform_fee_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_fee_standing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view own fee statements" ON public.platform_fee_statements;
CREATE POLICY "Tenant admins can view own fee statements"
  ON public.platform_fee_statements FOR SELECT TO authenticated
  USING (is_admin_of(tenant_id) OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS "Tenant admins can view own fee payments" ON public.platform_fee_payments;
CREATE POLICY "Tenant admins can view own fee payments"
  ON public.platform_fee_payments FOR SELECT TO authenticated
  USING (is_admin_of(tenant_id) OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS "Tenant admins can view own fee standing" ON public.tenant_fee_standing;
CREATE POLICY "Tenant admins can view own fee standing"
  ON public.tenant_fee_standing FOR SELECT TO authenticated
  USING (is_admin_of(tenant_id) OR (SELECT is_super_admin()));

REVOKE ALL ON TABLE public.platform_fee_statements, public.platform_fee_payments, public.tenant_fee_standing
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_fee_statements, public.platform_fee_payments, public.tenant_fee_standing
  TO authenticated;
GRANT ALL ON TABLE public.platform_fee_statements, public.platform_fee_payments, public.tenant_fee_standing
  TO service_role;

-- ─── 6. platform_payment_requests.request_type = 'fee' (pay-now, 2.4) ───────
-- Only widens the CHECK. Fee requests also need plan_id nullable; that change
-- ships with the pay-now route, which is the first writer.

ALTER TABLE public.platform_payment_requests
  DROP CONSTRAINT IF EXISTS platform_payment_requests_request_type_check;
ALTER TABLE public.platform_payment_requests
  ADD CONSTRAINT platform_payment_requests_request_type_check
  CHECK (request_type IN ('upgrade', 'downgrade', 'renewal', 'fee')) NOT VALID;
ALTER TABLE public.platform_payment_requests
  VALIDATE CONSTRAINT platform_payment_requests_request_type_check;

-- ─── 7. Functions ───────────────────────────────────────────────────────────

-- The sales gate's read (4.3). One PK lookup per table. False unless the kill
-- switch is 'enforce', so it is inert in 'off' and the shipped 'notify_only'.
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
  );
$function$;

COMMENT ON FUNCTION public.is_tenant_sales_blocked(uuid) IS
  'Issue #929: true only when platform_fee_config.enforcement_mode = enforce AND tenant_fee_standing.blocked_at is set (D8). Gates NEW sales only; never course access (D5).';

-- SQL mirror of computeFeeBalances() in lib/payments/platform-fee-owed.ts, for
-- synchronous re-evaluation on settle. Keep in step with it:
--  * eligible rails = PROVIDER_CAPABILITIES with bearsPlatformFee = false, keyed
--    on the row's own payment_provider (D10). The list below is checked against
--    the TS map by tests/unit/platform-fee-owed.test.ts;
--  * status 'successful', amount > 0, kept = amount - refunded_amount (floored);
--  * school share = round(base * pct / 100, 2), fee = base - share (per row);
--  * pct = snapshot, else current revenue_splits, else 80 (DEFAULT_SCHOOL_PERCENTAGE);
--  * hyperinflation currency WITH a snapshot -> USD bucket, base =
--    round(usd_amount * kept / amount, 2); without one it keeps its own bucket;
--  * paid = succeeded payments, all time, per currency.
-- `_accrued_before` limits ACCRUALS to rows dated before it (D4); payments are
-- always all-time. numeric round() is half away from zero, as roundMoney().
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
      (SELECT rs.school_percentage FROM revenue_splits rs WHERE rs.tenant_id = _tenant_id),
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
  'Issue #929: platform fee balance per ledger currency for one tenant (SQL mirror of lib/payments/platform-fee-owed.ts computeFeeBalances). Service role only.';

-- Synchronous re-evaluation after a payment settles (2.4) and the cron's
-- "Recover" phase (3). It only ever moves a tenant TOWARDS 'ok': blocking is
-- the cron's job (grace, min balance, enforce mode, per-run cap). Stateless
-- (D4): fees accrued before the latest passed due boundary minus all-time
-- payments. A month closes on the 1st 00:00 UTC and is due 3 days later
-- (FEE_DUE_DAYS, latestFeeDueBoundary() in TS).
--   * nothing owed at all              -> ok, block and overdue cleared
--   * nothing overdue (only this month) -> an overdue/blocked tenant becomes ok
--   * otherwise                         -> unchanged
-- A tenant with no standing row has nothing to recover; no row is created.
CREATE OR REPLACE FUNCTION public.reevaluate_tenant_fee_standing(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
  _month_start timestamptz := date_trunc('month', _now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  _cutoff timestamptz;
  _state text;
  _owes boolean;
  _overdue boolean;
BEGIN
  SELECT s.state INTO _state
  FROM tenant_fee_standing s
  WHERE s.tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ok';
  END IF;

  IF _now > _month_start + interval '3 days' THEN
    _cutoff := _month_start;
  ELSE
    _cutoff := _month_start - interval '1 month';
  END IF;

  SELECT EXISTS (SELECT 1 FROM platform_fee_ledger(_tenant_id) l WHERE l.accrued - l.paid > 0.005)
    INTO _owes;
  SELECT EXISTS (SELECT 1 FROM platform_fee_ledger(_tenant_id, _cutoff) l WHERE l.accrued - l.paid > 0.005)
    INTO _overdue;

  IF NOT _owes OR (NOT _overdue AND _state IN ('overdue', 'blocked')) THEN
    _state := 'ok';
    UPDATE tenant_fee_standing
       SET state = 'ok', blocked_at = NULL, overdue_since = NULL,
           last_evaluated_at = _now, updated_at = _now
     WHERE tenant_id = _tenant_id;
  ELSE
    UPDATE tenant_fee_standing
       SET last_evaluated_at = _now
     WHERE tenant_id = _tenant_id;
  END IF;

  RETURN _state;
END;
$function$;

COMMENT ON FUNCTION public.reevaluate_tenant_fee_standing(uuid) IS
  'Issue #929: re-derives a tenant''s fee balance and clears overdue/blocked standing when nothing is overdue. Never sets blocked_at. Service role only.';

REVOKE EXECUTE ON FUNCTION
  public.is_tenant_sales_blocked(uuid),
  public.platform_fee_ledger(uuid, timestamptz),
  public.reevaluate_tenant_fee_standing(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.is_tenant_sales_blocked(uuid),
  public.platform_fee_ledger(uuid, timestamptz),
  public.reevaluate_tenant_fee_standing(uuid)
TO service_role;
