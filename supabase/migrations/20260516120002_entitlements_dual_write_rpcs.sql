-- Phase 1 / Migration C — Dual-write RPCs + drop the broken CHECK.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md
--
-- The `valid_enrollment` CHECK (product_id XOR subscription_id) is what caused
-- the HTTP 500 on plan purchase for a course already owned via a product.
-- It is dropped here: the columns remain (dual-written until Phase 3) but a row
-- may now legitimately carry both — that legacy attribution is no longer read
-- once Phase 2 lands. Access correctness now lives in `entitlements`.
--
-- enroll_user / handle_new_subscription / handle_subscription_status_change
-- write BOTH the new `entitlements` rows and the legacy `enrollments` columns
-- (dual-write), so nothing that still reads `enrollments` breaks.

-- 1. Drop the constraint that the overlap case violates ----------------------
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS valid_enrollment;

-- 2. enroll_user — product purchase ------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_user(_user_id uuid, _product_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

        -- New model: perpetual product entitlement
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _rec.tenant_id, 'product', _product_id, 'active', NULL)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status     = 'active',
            revoked_at = NULL,
            tenant_id  = EXCLUDED.tenant_id;

        -- Legacy dual-write (retired in Phase 3)
        INSERT INTO enrollments (user_id, course_id, product_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, _product_id, NOW(), 'active', _rec.tenant_id)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            status     = 'active',
            product_id = EXCLUDED.product_id,
            tenant_id  = EXCLUDED.tenant_id;
    END LOOP;

    IF NOT _has_courses THEN
        RAISE NOTICE 'Product % is not associated with any course.', _product_id;
    END IF;
END;
$function$;

-- 3. handle_new_subscription — plan purchase ---------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_subscription(_user_id uuid, _plan_id integer, _transaction_id integer, _start_date timestamp with time zone DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        start_date          = EXCLUDED.start_date,
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
        -- New model: subscription entitlement (expires with the subscription)
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status     = 'active',
            expires_at = EXCLUDED.expires_at,
            revoked_at = NULL,
            tenant_id  = EXCLUDED.tenant_id;

        -- Legacy dual-write (retired in Phase 3). With valid_enrollment dropped,
        -- an overlapping product+plan course may carry both ids here — harmless,
        -- the legacy attribution is no longer read after Phase 2.
        INSERT INTO enrollments (user_id, course_id, subscription_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, _subscription_id, NOW(), 'active', _tenant_id)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            status          = 'active',
            subscription_id = EXCLUDED.subscription_id,
            tenant_id       = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;

-- 4. handle_subscription_status_change — lapse / reactivate ------------------
CREATE OR REPLACE FUNCTION public.handle_subscription_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.subscription_status IN ('canceled', 'expired')
       AND OLD.subscription_status NOT IN ('canceled', 'expired')
    THEN
        -- New model: expire only this subscription's entitlements.
        -- Product / free entitlements for the same course are untouched —
        -- a user who also owns the course outright keeps access.
        UPDATE entitlements
        SET status = 'expired', revoked_at = now()
        WHERE source_type = 'subscription'
          AND source_id = NEW.subscription_id
          AND status = 'active';
        -- Legacy dual-write
        UPDATE enrollments
        SET status = 'disabled'
        WHERE subscription_id = NEW.subscription_id
          AND status = 'active';
    END IF;

    IF NEW.subscription_status IN ('active', 'renewed')
       AND OLD.subscription_status IN ('canceled', 'expired')
    THEN
        -- New model
        UPDATE entitlements
        SET status = 'active', revoked_at = NULL, expires_at = NEW.end_date
        WHERE source_type = 'subscription'
          AND source_id = NEW.subscription_id;
        -- Legacy dual-write
        UPDATE enrollments
        SET status = 'active'
        WHERE subscription_id = NEW.subscription_id
          AND status = 'disabled';
    END IF;

    RETURN NEW;
END;
$function$;

-- 5. grant_free_entitlement — free-course access (wired up in Phase 2) -------
CREATE OR REPLACE FUNCTION public.grant_free_entitlement(_user_id uuid, _course_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _tenant_id UUID;
BEGIN
    SELECT tenant_id INTO _tenant_id FROM courses WHERE course_id = _course_id;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Course % not found', _course_id;
    END IF;

    -- New model: free entitlement (perpetual, no source_id)
    INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
    VALUES (_user_id, _course_id, _tenant_id, 'free', NULL, 'active', NULL)
    ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
        status     = 'active',
        revoked_at = NULL,
        tenant_id  = EXCLUDED.tenant_id;

    -- Legacy learning record (no billing columns — only valid with
    -- valid_enrollment dropped, see step 1)
    INSERT INTO enrollments (user_id, course_id, enrollment_date, status, tenant_id)
    VALUES (_user_id, _course_id, NOW(), 'active', _tenant_id)
    ON CONFLICT (user_id, course_id) DO UPDATE SET
        status    = 'active',
        tenant_id = EXCLUDED.tenant_id;
END;
$function$;
