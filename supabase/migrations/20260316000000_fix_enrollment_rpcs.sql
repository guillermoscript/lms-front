-- =============================================================================
-- Fix Manual Payment Flow: RPCs, Enrollments, and Subscription Lifecycle
-- =============================================================================

-- 1a. Rewrite enroll_user() RPC
-- - FOR loop through ALL product_courses (not SELECT INTO for one)
-- - Set status = 'active' and tenant_id on each enrollment
-- - ON CONFLICT reactivates disabled enrollments
-- - SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.enroll_user(_user_id uuid, _product_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    _rec RECORD;
    _has_courses BOOLEAN := FALSE;
BEGIN
    FOR _rec IN
        SELECT pc.course_id, pc.tenant_id
        FROM product_courses pc
        WHERE pc.product_id = _product_id
    LOOP
        _has_courses := TRUE;

        INSERT INTO enrollments (user_id, course_id, product_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, _product_id, NOW(), 'active', _rec.tenant_id)
        ON CONFLICT (user_id, course_id)
        DO UPDATE SET
            status = 'active',
            product_id = EXCLUDED.product_id,
            tenant_id = EXCLUDED.tenant_id;
    END LOOP;

    IF NOT _has_courses THEN
        RAISE NOTICE 'Product % is not associated with any course.', _product_id;
    END IF;
END;
$function$;

-- 1b. Rewrite handle_new_subscription() RPC
-- - Inherit tenant_id from plan
-- - Set tenant_id on subscription insert
-- - Create enrollment rows for ALL plan_courses
-- - ON CONFLICT reactivates disabled enrollments
-- - SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.handle_new_subscription(
    _user_id uuid,
    _plan_id integer,
    _transaction_id integer,
    _start_date timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    _duration INTERVAL;
    _end_date TIMESTAMP WITH TIME ZONE;
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

    _end_date := _start_date + _duration;

    INSERT INTO subscriptions (
        user_id, plan_id, start_date, end_date,
        transaction_id, subscription_status, tenant_id
    )
    VALUES (
        _user_id, _plan_id, _start_date, _end_date,
        _transaction_id, 'active', _tenant_id
    )
    ON CONFLICT (user_id, plan_id) DO UPDATE SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        transaction_id = EXCLUDED.transaction_id,
        subscription_status = 'active',
        tenant_id = EXCLUDED.tenant_id,
        ended_at = NULL
    RETURNING subscription_id INTO _subscription_id;

    FOR _rec IN
        SELECT pc.course_id
        FROM plan_courses pc
        WHERE pc.plan_id = _plan_id
    LOOP
        INSERT INTO enrollments (
            user_id, course_id, subscription_id,
            enrollment_date, status, tenant_id
        )
        VALUES (
            _user_id, _rec.course_id, _subscription_id,
            NOW(), 'active', _tenant_id
        )
        ON CONFLICT (user_id, course_id)
        DO UPDATE SET
            status = 'active',
            subscription_id = EXCLUDED.subscription_id,
            tenant_id = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;

-- 1c. Trigger: Disable enrollments when subscription expires/cancels
CREATE OR REPLACE FUNCTION public.handle_subscription_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF NEW.subscription_status IN ('canceled', 'expired')
       AND OLD.subscription_status NOT IN ('canceled', 'expired')
    THEN
        UPDATE enrollments
        SET status = 'disabled'
        WHERE subscription_id = NEW.subscription_id
          AND status = 'active';
    END IF;

    IF NEW.subscription_status = 'active'
       AND OLD.subscription_status IN ('canceled', 'expired')
    THEN
        UPDATE enrollments
        SET status = 'active'
        WHERE subscription_id = NEW.subscription_id
          AND status = 'disabled';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_subscription_status_change ON subscriptions;
CREATE TRIGGER on_subscription_status_change
    AFTER UPDATE OF subscription_status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION handle_subscription_status_change();

-- 1d. Cron: Expire student subscriptions daily at 3AM UTC
CREATE OR REPLACE FUNCTION public.handle_student_subscription_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    UPDATE subscriptions
    SET subscription_status = 'expired',
        ended_at = NOW()
    WHERE subscription_status = 'active'
      AND end_date < NOW();
END;
$function$;

SELECT cron.schedule(
    'expire-student-subscriptions',
    '0 3 * * *',
    'SELECT handle_student_subscription_expiry()'
);
