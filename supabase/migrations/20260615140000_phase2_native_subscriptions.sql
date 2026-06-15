-- Phase 2 of provider-agnostic payments (issue #280): native Stripe
-- subscriptions. Plan checkout now creates a real Stripe Subscription and must
-- persist its id onto our subscription row at creation, so renewal / cancel
-- webhooks can match it.
--
-- 1. Carry the provider + provider subscription id on the transaction so the
--    creation trigger can copy them onto the subscriptions row.
-- 2. handle_new_subscription: copy those fields + align current_period_end with
--    the access window (end_date).
-- 3. extend_subscription_period: the renewal path. A Stripe `invoice.payment_
--    succeeded` (billing_reason = subscription_cycle) can't be modelled as a new
--    transaction (the transactions_unique_plan partial index forbids a second
--    successful row per (user, plan)), so renewals extend the subscription and
--    its entitlements directly.

-- 1. transactions: provider columns (idempotent; column may already exist in
--    cloud as drift — the student checkout already writes payment_provider).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_provider         TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

-- 2. handle_new_subscription — same body as 20260530150000 (grant access only,
--    no auto-enroll) plus: copy payment_provider / provider_subscription_id from
--    the transaction, and set current_period_end = end_date.
CREATE OR REPLACE FUNCTION public.handle_new_subscription(
  _user_id uuid,
  _plan_id integer,
  _transaction_id integer,
  _start_date timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _duration INTERVAL;
    _end_date TIMESTAMP WITH TIME ZONE;
    _existing_end TIMESTAMP WITH TIME ZONE;
    _tenant_id UUID;
    _subscription_id INTEGER;
    _provider TEXT;
    _provider_sub_id TEXT;
    _rec RECORD;
BEGIN
    SELECT make_interval(days => p.duration_in_days), p.tenant_id INTO _duration, _tenant_id
    FROM plans p WHERE p.plan_id = _plan_id;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', _plan_id;
    END IF;

    -- Provider info recorded on the transaction at checkout (native sub id).
    SELECT t.payment_provider, t.provider_subscription_id
      INTO _provider, _provider_sub_id
    FROM transactions t WHERE t.transaction_id = _transaction_id;

    SELECT end_date INTO _existing_end FROM subscriptions WHERE user_id = _user_id AND plan_id = _plan_id;
    _end_date := GREATEST(COALESCE(_existing_end, _start_date), _start_date) + _duration;

    INSERT INTO subscriptions (
        user_id, plan_id, start_date, end_date, current_period_end, transaction_id,
        subscription_status, tenant_id, payment_provider, provider_subscription_id
    )
    VALUES (
        _user_id, _plan_id, _start_date, _end_date, _end_date, _transaction_id,
        'active', _tenant_id, COALESCE(_provider, 'manual'), _provider_sub_id
    )
    ON CONFLICT (user_id, plan_id) DO UPDATE SET
        end_date = EXCLUDED.end_date,
        current_period_end = EXCLUDED.current_period_end,
        transaction_id = EXCLUDED.transaction_id,
        subscription_status = 'active',
        tenant_id = EXCLUDED.tenant_id,
        ended_at = NULL,
        -- COALESCE so a manual/legacy transaction with NULL provider info never
        -- wipes an existing native subscription id.
        payment_provider = COALESCE(EXCLUDED.payment_provider, subscriptions.payment_provider),
        provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id)
    RETURNING subscription_id INTO _subscription_id;

    -- Grant access only. Enrollment is the student's explicit choice (self-enroll
    -- via /browse), NOT auto-created here.
    FOR _rec IN SELECT pc.course_id FROM plan_courses pc WHERE pc.plan_id = _plan_id
    LOOP
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status = 'active', expires_at = EXCLUDED.expires_at, revoked_at = NULL, tenant_id = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;

-- 3. extend_subscription_period — renewal path (webhook-driven).
CREATE OR REPLACE FUNCTION public.extend_subscription_period(
  _provider_subscription_id text,
  _provider text,
  _new_period_end timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _subscription_id INTEGER;
BEGIN
    IF _new_period_end IS NULL THEN
        RAISE NOTICE 'extend_subscription_period: null period end for % %', _provider, _provider_subscription_id;
        RETURN;
    END IF;

    UPDATE subscriptions
       SET end_date = _new_period_end,
           current_period_end = _new_period_end,
           subscription_status = 'active',
           ended_at = NULL
     WHERE provider_subscription_id = _provider_subscription_id
       AND payment_provider = _provider
    RETURNING subscription_id INTO _subscription_id;

    IF _subscription_id IS NULL THEN
        RAISE NOTICE 'extend_subscription_period: no subscription for % %', _provider, _provider_subscription_id;
        RETURN;
    END IF;

    -- Extend the access window on this subscription's entitlements.
    UPDATE entitlements
       SET expires_at = _new_period_end, status = 'active', revoked_at = NULL
     WHERE source_type = 'subscription' AND source_id = _subscription_id;
END;
$function$;
