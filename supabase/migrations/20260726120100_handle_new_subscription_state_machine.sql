-- handle_new_subscription state-machine fixes — issue #545 (EPIC #540 §2.2).
--
-- Two changes on top of 20260719120000_guard_parallel_subscriptions.sql:
--
-- 1. `renewed` joins the #459 parallel-subscription backstop. The guard checked
--    `IN ('active','past_due')` while six other places treat `renewed` as live
--    (change_subscription_plan's own supersession SELECT among them), so a
--    student holding a `renewed` subscription passed both the app guard
--    (lib/payments/subscription-guard.ts) and this DB backstop and could check
--    out a second plan — the exact parallel double-billing #459 exists to stop.
--    `renewed` rows are the long-lived paying subscribers renewed before
--    20260516140000 stopped writing that status, so this is the population it
--    matters most for.
--
-- 2. Re-purchasing a plan that is scheduled to cancel un-schedules the cancel.
--    The ON CONFLICT branch (the renewal path) flipped the row back to 'active'
--    and extended the period but left `cancel_at_period_end = true` behind, so
--    the subscription the student had just paid for was still torn down at
--    period end. With the #545 contract (20260726120000) `cancel_at` must be
--    cleared with the flag, so both move together here.
--
-- Body otherwise identical to 20260719120000_guard_parallel_subscriptions.sql.

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
    -- existing row are exempt. `renewed` counts as live (#545) — it grants
    -- access and still bills, so letting it through re-opened #459.
    IF NOT _is_renewal THEN
        PERFORM 1 FROM subscriptions s
         WHERE s.user_id = _user_id
           AND s.tenant_id = _tenant_id
           AND s.plan_id <> _plan_id
           AND s.subscription_status IN ('active', 'renewed', 'past_due');
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
        -- Paying for this plan again un-schedules a pending cancel (#545):
        -- leaving the flag set tore down the period the student just bought.
        -- cancel_at moves with the flag (subscriptions_cancel_at_requires_schedule).
        cancel_at_period_end = false,
        cancel_at = NULL,
        canceled_at = NULL,
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
