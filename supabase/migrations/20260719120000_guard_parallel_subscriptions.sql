-- Parallel-subscription guard, DB backstop (issue #459).
--
-- The subscriptions unique key is (user_id, plan_id), so a successful
-- transaction for a *different* plan silently creates a second live
-- subscription that bills alongside the first. Every checkout entry point now
-- guards against this app-side (lib/payments/subscription-guard.ts); this
-- migration adds the defense-in-depth backstop inside handle_new_subscription
-- itself, covering any path that reaches the transaction trigger without
-- passing an app guard.
--
-- Semantics (renewal-safe):
--   * A row already exists for (user_id, plan_id) → renewal. Always allowed,
--     even if the user holds other live subscriptions (pre-existing parallel
--     subscribers keep renewing).
--   * No row for this plan, but another 'active'/'past_due' subscription
--     exists for the same (user_id, tenant) → RAISE. A loud, recoverable
--     failure (the webhook/action errors, the transaction stays visible)
--     beats a silent second billing cycle.
--
-- Body otherwise identical to 20260615140000_phase2_native_subscriptions.sql.

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
    _is_renewal BOOLEAN;
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
    _is_renewal := FOUND;

    -- Parallel-subscription backstop (#459): refuse to CREATE a subscription
    -- while another live one exists for the same user + tenant. Renewals of an
    -- existing row are exempt.
    IF NOT _is_renewal THEN
        PERFORM 1 FROM subscriptions s
         WHERE s.user_id = _user_id
           AND s.tenant_id = _tenant_id
           AND s.plan_id <> _plan_id
           AND s.subscription_status IN ('active', 'past_due');
        IF FOUND THEN
            RAISE EXCEPTION 'parallel_subscription: user % already has a live subscription in tenant %; refusing to create a second one for plan % (issue #459)',
                _user_id, _tenant_id, _plan_id;
        END IF;
    END IF;

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
