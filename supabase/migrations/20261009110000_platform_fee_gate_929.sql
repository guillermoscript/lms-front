-- Issue #929 — platform fee sales gate + enforcement cron schedule (wave 2,
-- slicing steps 3 and 4). Design: docs/PLATFORM_FEE_LEDGER_DESIGN.md
-- sections 3, 4.1-4.3 and D5/D8/D9. Builds on 20261009100000_platform_fee_ledger_929.
--
-- What this adds:
--   1. 'ves' on the currency_type enum (hyperinflation currency, Q2).
--   2. The two decided renewal constants as IMMUTABLE functions (the SQL side
--      of lib/billing/sales-gate-constants.ts; a unit test keeps them equal).
--   3. is_subscription_renewal()        — the exact exemption of design 4.2a.
--   4. is_preblock_request_settlement() — admin confirming a manual payment
--      request opened BEFORE the block (money already seen, design 4.2).
--   5. transaction_sales_gate_allows()  — the one predicate the trigger AND
--      the app pre-check (assertSalesOpen) both call, so they cannot drift.
--   6. BEFORE INSERT trigger on transactions raising SQLSTATE LM003
--      (message 'sales_blocked:fees'). LM001 = plan limit, LM002 = tenant ban.
--   7. grant_free_entitlement() refuses a NEW free self-enrollment while
--      blocked (design 4.1), via free_enrollment_allowed().
--   8. pg_cron job enforce-platform-fees-daily (0 5 * * *) through
--      invoke_cron_route(); .github/workflows/cron.yml keeps 0 6 as fallback.
--
-- INERT BY DEFAULT. Every gate reads is_tenant_sales_blocked(), which is false
-- unless platform_fee_config.enforcement_mode = 'enforce' AND the tenant's
-- tenant_fee_standing.blocked_at is set (D8). The shipped mode is
-- 'notify_only', so nothing is refused until a super admin flips the switch.
--
-- D5. INSERT only. Nothing here touches the course access check, entitlements of
-- existing holders, enroll_user(), handle_new_subscription() or any UPDATE of
-- an existing transactions row: settling a pending row (webhooks, polls,
-- manual confirms of existing rows) always continues, and paying students
-- never lose access over the school's fee debt.
--
-- SAFETY. Additive: new functions, one new trigger, one CREATE OR REPLACE of
-- grant_free_entitlement (body identical to 20260716225213 plus one check),
-- one enum value, one cron job. No CHECK constraints are added.
-- Rollback: rollback/20261009110000_platform_fee_gate_929.down.sql (the enum
-- value cannot be removed; see there).

-- ─── 1. currency_type gains 'ves' ───────────────────────────────────────────
-- ADD VALUE inside a transaction is allowed on PG >= 12 as long as the new
-- value is not USED in the same transaction; nothing below uses it.
ALTER TYPE public.currency_type ADD VALUE IF NOT EXISTS 'ves';

-- ─── 2. Decided constants (design 4.2a) ─────────────────────────────────────
-- Defined ONCE here for SQL and once in lib/billing/sales-gate-constants.ts
-- for TS; tests/unit/sales-gate-contract.test.ts fails if the two disagree.
--  * SELF_MANAGED_RENEWAL_WINDOW_DAYS = 30: a crypto/manual holder may renew
--    up to 30 days after the period their last payment bought. Separate from
--    GRACE_DAYS / FEE_GRACE_DAYS on purpose.
--  * IN_FLIGHT_MAX_AGE_DAYS = 3: a pending native-subscription transaction
--    anchors a first-invoice webhook (A.2) only while it is this young.

CREATE OR REPLACE FUNCTION public.fee_gate_self_managed_renewal_window_days()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT 30 $function$;

CREATE OR REPLACE FUNCTION public.fee_gate_in_flight_max_age_days()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT 3 $function$;

-- ─── 3. Renewal exemption (design 4.2a, D9) ─────────────────────────────────
-- Row-based only: never caller flags, never settings. Plan and provider must
-- match, so it cannot be used to switch plan or rail while blocked.
CREATE OR REPLACE FUNCTION public.is_subscription_renewal(
  _tenant_id uuid,
  _user_id uuid,
  _plan_id integer,
  _payment_provider text,
  _provider_subscription_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _last_paid timestamptz;
  _duration integer;
BEGIN
  IF _tenant_id IS NULL OR _user_id IS NULL OR _plan_id IS NULL OR _payment_provider IS NULL THEN
    RETURN false;
  END IF;

  IF _provider_subscription_id IS NOT NULL THEN
    -- A.1 Native renewal: a LIVE subscription with this provider id.
    IF EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.tenant_id = _tenant_id
        AND s.user_id = _user_id
        AND s.plan_id = _plan_id
        AND s.payment_provider = _payment_provider
        AND s.provider_subscription_id = _provider_subscription_id
        AND s.subscription_status IN ('active', 'renewed', 'past_due')
    ) THEN
      RETURN true;
    END IF;

    -- A.2 Gap fix: the first invoice of a checkout started before the block.
    -- Anchored on a prior transaction of the same subscription id that is
    -- settled, or pending and younger than IN_FLIGHT_MAX_AGE_DAYS.
    RETURN EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.tenant_id = _tenant_id
        AND t.user_id = _user_id
        AND t.plan_id = _plan_id
        AND t.product_id IS NULL
        AND t.payment_provider = _payment_provider
        AND t.provider_subscription_id = _provider_subscription_id
        AND (
          t.status = 'successful'
          OR (
            t.status = 'pending'
            AND t.transaction_date >= now() - make_interval(days => fee_gate_in_flight_max_age_days())
          )
        )
    );
  END IF;

  -- B. Self-managed renewal (crypto / manual, no provider subscription id).
  -- Anchor: the latest successful, not fully refunded plan payment on the
  -- same rail.
  SELECT max(t.transaction_date) INTO _last_paid
  FROM transactions t
  WHERE t.tenant_id = _tenant_id
    AND t.user_id = _user_id
    AND t.plan_id = _plan_id
    AND t.product_id IS NULL
    AND t.payment_provider = _payment_provider
    AND t.status = 'successful'
    AND (COALESCE(t.refunded_amount, 0) < t.amount OR t.amount = 0);

  IF _last_paid IS NULL THEN
    RETURN false;  -- never held this plan on this rail: a new sale
  END IF;

  -- B.1 the subscription row is still live.
  IF EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = _user_id
      AND s.plan_id = _plan_id
      AND s.payment_provider = _payment_provider
      AND s.subscription_status IN ('active', 'renewed', 'past_due')
  ) THEN
    RETURN true;
  END IF;

  -- An explicit cancel ends the holder relationship: buying again is a new sale.
  IF EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = _user_id
      AND s.plan_id = _plan_id
      AND s.payment_provider = _payment_provider
      AND s.subscription_status = 'canceled'
  ) THEN
    RETURN false;
  END IF;

  -- B.2 lapsed (e.g. expired by the selfManagedPeriod cron) but still inside
  -- the renewal window after the period the last payment bought.
  SELECT p.duration_in_days INTO _duration FROM plans p WHERE p.plan_id = _plan_id;
  RETURN _last_paid
         + make_interval(days => COALESCE(_duration, 0) + fee_gate_self_managed_renewal_window_days())
         >= now();
END;
$function$;

COMMENT ON FUNCTION public.is_subscription_renewal(uuid, uuid, integer, text, text) IS
  'Issue #929 design 4.2a: true when a plan transaction renews a subscription the student already holds (native A.1/A.2, self-managed B). Used by transaction_sales_gate_allows(). Service role only.';

-- ─── 4. Settlement of a manual request opened before the block (4.2) ───────
-- completeAndEnroll() inserts a NEW transactions row for a payment_requests
-- row the admin marked payment_received: the money was already seen, so
-- refusing it would be money-without-service. Only requests created before
-- blocked_at qualify (new requests are refused by the app pre-check).
CREATE OR REPLACE FUNCTION public.is_preblock_request_settlement(
  _tenant_id uuid,
  _user_id uuid,
  _product_id integer,
  _plan_id integer,
  _payment_provider text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _payment_provider = 'manual'
     AND _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM payment_requests pr
       JOIN tenant_fee_standing s ON s.tenant_id = pr.tenant_id
       WHERE pr.tenant_id = _tenant_id
         AND pr.user_id = _user_id
         AND pr.status = 'payment_received'
         AND pr.product_id IS NOT DISTINCT FROM _product_id
         AND pr.plan_id IS NOT DISTINCT FROM _plan_id
         AND s.blocked_at IS NOT NULL
         AND pr.created_at < s.blocked_at
     );
$function$;

COMMENT ON FUNCTION public.is_preblock_request_settlement(uuid, uuid, integer, integer, text) IS
  'Issue #929: true when a manual transaction settles a payment request (payment_received) opened before the tenant was blocked. Service role only.';

-- ─── 5. The single gate predicate (trigger + app pre-check) ─────────────────
-- plpgsql so the cheap PK read short-circuits everything else on the hot path.
CREATE OR REPLACE FUNCTION public.transaction_sales_gate_allows(
  _tenant_id uuid,
  _user_id uuid,
  _product_id integer,
  _plan_id integer,
  _payment_provider text,
  _provider_subscription_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_tenant_sales_blocked(_tenant_id) THEN
    RETURN true;
  END IF;
  IF _plan_id IS NOT NULL AND _product_id IS NULL
     AND is_subscription_renewal(_tenant_id, _user_id, _plan_id, _payment_provider, _provider_subscription_id) THEN
    RETURN true;
  END IF;
  RETURN is_preblock_request_settlement(_tenant_id, _user_id, _product_id, _plan_id, _payment_provider);
END;
$function$;

COMMENT ON FUNCTION public.transaction_sales_gate_allows(uuid, uuid, integer, integer, text, text) IS
  'Issue #929: may a NEW transactions row be inserted for this tenant? True unless sales are blocked (enforce + blocked_at), with the renewal (4.2a) and pre-block settlement exemptions. Called by the INSERT trigger and by assertSalesOpen().';

-- ─── 6. The DB backstop on transactions INSERT (4.3) ────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_fee_sales_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Operators / seed only, like app.bypass_plan_limits (#658).
  IF COALESCE(current_setting('app.bypass_fee_block', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF transaction_sales_gate_allows(
       NEW.tenant_id, NEW.user_id, NEW.product_id, NEW.plan_id,
       NEW.payment_provider, NEW.provider_subscription_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sales_blocked:fees'
    USING ERRCODE = 'LM003',
          HINT = 'This school is not accepting new sales (platform fee standing, issue #929). Map with isSalesBlockedError().';
END;
$function$;

DROP TRIGGER IF EXISTS before_transaction_fee_sales_block_insert ON public.transactions;
CREATE TRIGGER before_transaction_fee_sales_block_insert
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fee_sales_block();

-- ─── 7. Free self-enrollment (4.1) ──────────────────────────────────────────
-- A free course grants an entitlement with no transactions row, so the
-- trigger above never sees it. Re-clicking a course the student already holds
-- stays allowed (idempotent, not a new enrollment).
CREATE OR REPLACE FUNCTION public.free_enrollment_allowed(_tenant_id uuid, _user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_tenant_sales_blocked(_tenant_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.tenant_id = _tenant_id
      AND e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.source_type = 'free'
      AND e.status = 'active'
  );
END;
$function$;

COMMENT ON FUNCTION public.free_enrollment_allowed(uuid, uuid, integer) IS
  'Issue #929: may this user self-enroll in this free course now? False only while sales are blocked and the user does not already hold it.';

-- Body identical to 20260716225213_harden_free_enrollment.sql except the
-- marked fee-gate check.
CREATE OR REPLACE FUNCTION public.grant_free_entitlement(_user_id uuid, _course_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    _caller_id uuid := auth.uid();
    _tenant_id uuid;
BEGIN
    IF _caller_id IS NULL OR _caller_id <> _user_id THEN
        RAISE EXCEPTION 'Free enrollment can only be granted to the authenticated user';
    END IF;

    SELECT c.tenant_id
    INTO _tenant_id
    FROM public.courses AS c
    WHERE c.course_id = _course_id
      AND c.status = 'published';

    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Course is not available for enrollment';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users AS tu
        WHERE tu.user_id = _caller_id
          AND tu.tenant_id = _tenant_id
          AND tu.status = 'active'
    ) THEN
        RAISE EXCEPTION 'User is not an active member of this tenant';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.product_courses AS pc
        JOIN public.products AS p
          ON p.product_id = pc.product_id
         AND p.tenant_id = pc.tenant_id
        WHERE pc.course_id = _course_id
          AND pc.tenant_id = _tenant_id
          AND p.price <> 0
    ) THEN
        RAISE EXCEPTION 'This course requires payment';
    END IF;

    -- #929 fee gate: no NEW free enrollment while the school's sales are blocked.
    IF NOT public.free_enrollment_allowed(_tenant_id, _caller_id, _course_id) THEN
        RAISE EXCEPTION 'sales_blocked:fees' USING ERRCODE = 'LM003';
    END IF;

    INSERT INTO public.entitlements (
        user_id,
        course_id,
        tenant_id,
        source_type,
        source_id,
        status,
        expires_at
    )
    VALUES (_caller_id, _course_id, _tenant_id, 'free', NULL, 'active', NULL)
    ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
        status = 'active',
        revoked_at = NULL,
        tenant_id = EXCLUDED.tenant_id;

    INSERT INTO public.enrollments (
        user_id,
        course_id,
        enrollment_date,
        status,
        tenant_id
    )
    VALUES (_caller_id, _course_id, NOW(), 'active', _tenant_id)
    ON CONFLICT (user_id, course_id) DO UPDATE SET
        status = 'active',
        tenant_id = EXCLUDED.tenant_id;
END;
$function$;

-- ─── Grants: gate helpers are service-role only (the trigger and the
-- SECURITY DEFINER RPCs run as the owner). grant_free_entitlement keeps its
-- existing grants (CREATE OR REPLACE preserves them).
REVOKE EXECUTE ON FUNCTION
  public.is_subscription_renewal(uuid, uuid, integer, text, text),
  public.is_preblock_request_settlement(uuid, uuid, integer, integer, text),
  public.transaction_sales_gate_allows(uuid, uuid, integer, integer, text, text),
  public.free_enrollment_allowed(uuid, uuid, integer),
  public.enforce_fee_sales_block()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.is_subscription_renewal(uuid, uuid, integer, text, text),
  public.is_preblock_request_settlement(uuid, uuid, integer, integer, text),
  public.transaction_sales_gate_allows(uuid, uuid, integer, integer, text, text),
  public.free_enrollment_allowed(uuid, uuid, integer)
TO service_role;

-- ─── 8. Scheduler (design 3, D7): pg_cron primary ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'enforce-platform-fees-daily',
      '0 5 * * *',
      $cron$SELECT public.invoke_cron_route('enforce-platform-fees')$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; enforce-platform-fees stays on the GitHub schedule only';
  END IF;
END $$;
