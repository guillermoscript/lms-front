-- Phase 2 — fix subscription renewal under the entitlements model.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md
--
-- The old `trigger_manage_transactions` renewal branch extended the
-- `subscriptions.end_date` but never touched `entitlements` — so after a
-- renewal the subscription entitlements kept their old `expires_at` and
-- `has_course_access()` would treat the course as lapsed.
--
-- Fix: make `handle_new_subscription` renewal-aware (extend from the existing
-- end_date when still in the future) and have the trigger ALWAYS call it.
-- The trigger is not SECURITY DEFINER, so it must not write `entitlements`
-- directly (RLS has no INSERT policy) — all entitlement writes go through the
-- SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.handle_new_subscription(_user_id uuid, _plan_id integer, _transaction_id integer, _start_date timestamp with time zone DEFAULT now())
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
    _rec RECORD;
BEGIN
    SELECT make_interval(days => p.duration_in_days), p.tenant_id
    INTO _duration, _tenant_id
    FROM plans p
    WHERE p.plan_id = _plan_id;

    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', _plan_id;
    END IF;

    -- Renewal-aware: extend from the existing end_date when it is still in the
    -- future, otherwise start fresh from _start_date.
    SELECT end_date INTO _existing_end
    FROM subscriptions
    WHERE user_id = _user_id AND plan_id = _plan_id;

    _end_date := GREATEST(COALESCE(_existing_end, _start_date), _start_date) + _duration;

    INSERT INTO subscriptions (
        user_id, plan_id, start_date, end_date,
        transaction_id, subscription_status, tenant_id
    )
    VALUES (
        _user_id, _plan_id, _start_date, _end_date,
        _transaction_id, 'active', _tenant_id
    )
    ON CONFLICT (user_id, plan_id) DO UPDATE SET
        end_date            = EXCLUDED.end_date,
        transaction_id      = EXCLUDED.transaction_id,
        subscription_status = 'active',
        tenant_id           = EXCLUDED.tenant_id,
        ended_at            = NULL
    RETURNING subscription_id INTO _subscription_id;

    FOR _rec IN
        SELECT pc.course_id
        FROM plan_courses pc
        WHERE pc.plan_id = _plan_id
    LOOP
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status     = 'active',
            expires_at = EXCLUDED.expires_at,
            revoked_at = NULL,
            tenant_id  = EXCLUDED.tenant_id;

        INSERT INTO enrollments (user_id, course_id, subscription_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, _subscription_id, NOW(), 'active', _tenant_id)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            status          = 'active',
            subscription_id = EXCLUDED.subscription_id,
            tenant_id       = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;

-- Trigger: always delegate plan handling to handle_new_subscription
-- (renewal-aware + idempotent). No direct entitlement writes here.
CREATE OR REPLACE FUNCTION public.trigger_manage_transactions()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  _course_id INTEGER;
BEGIN
  -- Product purchase → enroll in linked courses
  IF NEW.product_id IS NOT NULL THEN
    SELECT course_id INTO _course_id
    FROM product_courses
    WHERE product_id = NEW.product_id;
    IF FOUND AND NEW.status = 'successful' THEN
      PERFORM enroll_user(NEW.user_id, NEW.product_id);
    END IF;
  END IF;

  -- Plan purchase or renewal
  IF NEW.plan_id IS NOT NULL THEN
    IF NEW.status = 'successful' THEN
      PERFORM handle_new_subscription(NEW.user_id, NEW.plan_id, NEW.transaction_id);
    ELSIF NEW.status = 'failed' THEN
      PERFORM cancel_subscription(NEW.user_id, NEW.plan_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
