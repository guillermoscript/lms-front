-- Phase 2 — self_enroll_subscription_course RPC.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md §4.3
--
-- Replaces the client-side `enrollments` INSERT in lib/hooks/use-enrollment.ts.
-- A subscriber self-enrolling in a plan-covered course must produce a
-- `subscription` entitlement (so entitlement-based gates allow the course).
-- SECURITY DEFINER + auth.uid() — a user can only enroll themselves.

CREATE OR REPLACE FUNCTION public.self_enroll_subscription_course(_course_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _user_id   uuid := auth.uid();
    _tenant_id uuid;
    _subscription_id integer;
    _end_date  timestamptz;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT tenant_id INTO _tenant_id FROM courses WHERE course_id = _course_id;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    -- An active subscription of this user whose plan covers the course.
    SELECT s.subscription_id, s.end_date
    INTO _subscription_id, _end_date
    FROM subscriptions s
    JOIN plan_courses pc ON pc.plan_id = s.plan_id
    WHERE s.user_id = _user_id
      AND s.tenant_id = _tenant_id
      AND s.subscription_status IN ('active', 'renewed')
      AND s.end_date > now()
      AND pc.course_id = _course_id
    ORDER BY s.end_date DESC
    LIMIT 1;

    IF _subscription_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription covers this course';
    END IF;

    INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
    VALUES (_user_id, _course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
    ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
        status     = 'active',
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        tenant_id  = EXCLUDED.tenant_id;

    INSERT INTO enrollments (user_id, course_id, subscription_id, enrollment_date, status, tenant_id)
    VALUES (_user_id, _course_id, _subscription_id, NOW(), 'active', _tenant_id)
    ON CONFLICT (user_id, course_id) DO UPDATE SET
        status          = 'active',
        subscription_id = EXCLUDED.subscription_id,
        tenant_id       = EXCLUDED.tenant_id;
END;
$function$;
