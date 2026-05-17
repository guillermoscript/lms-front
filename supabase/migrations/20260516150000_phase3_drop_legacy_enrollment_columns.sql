-- Phase 3 — drop the legacy enrollments billing columns.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md
--
-- `enrollments` is now purely a learning record. Access lives entirely in
-- `entitlements`. This migration stops the RPC dual-write of
-- `enrollments.product_id` / `subscription_id`, then drops those columns
-- (their FKs drop with them).

-- 1. Recreate the RPCs without the legacy column writes --------------------

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

        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _rec.tenant_id, 'product', _product_id, 'active', NULL)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status     = 'active',
            revoked_at = NULL,
            tenant_id  = EXCLUDED.tenant_id;

        INSERT INTO enrollments (user_id, course_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, NOW(), 'active', _rec.tenant_id)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            status    = 'active',
            tenant_id = EXCLUDED.tenant_id;
    END LOOP;

    IF NOT _has_courses THEN
        RAISE NOTICE 'Product % is not associated with any course.', _product_id;
    END IF;
END;
$function$;

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

        INSERT INTO enrollments (user_id, course_id, enrollment_date, status, tenant_id)
        VALUES (_user_id, _rec.course_id, NOW(), 'active', _tenant_id)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            status    = 'active',
            tenant_id = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;

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

    INSERT INTO enrollments (user_id, course_id, enrollment_date, status, tenant_id)
    VALUES (_user_id, _course_id, NOW(), 'active', _tenant_id)
    ON CONFLICT (user_id, course_id) DO UPDATE SET
        status    = 'active',
        tenant_id = EXCLUDED.tenant_id;
END;
$function$;

-- handle_subscription_status_change: entitlements only (no legacy enrollments)
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
        UPDATE entitlements
        SET status = 'expired', revoked_at = now()
        WHERE source_type = 'subscription'
          AND source_id = NEW.subscription_id
          AND status = 'active';
    END IF;

    IF NEW.subscription_status IN ('active', 'renewed')
       AND OLD.subscription_status IN ('canceled', 'expired')
    THEN
        UPDATE entitlements
        SET status = 'active', revoked_at = NULL, expires_at = NEW.end_date
        WHERE source_type = 'subscription'
          AND source_id = NEW.subscription_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Rewrite the lesson_resources RLS policy --------------------------------
-- Its student-access branch joined `enrollments.product_id` (a hard
-- dependency that blocks the column drop). Switch it to has_course_access().
DROP POLICY IF EXISTS lesson_resources_select ON lesson_resources;
CREATE POLICY lesson_resources_select ON lesson_resources
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT ((current_setting('request.jwt.claims', true))::jsonb ->> 'tenant_id')::uuid)
    AND (
      -- Course author
      EXISTS (
        SELECT 1 FROM lessons l
        JOIN courses c ON c.course_id = l.course_id
        WHERE l.id = lesson_resources.lesson_id
          AND c.author_id = (SELECT auth.uid())
      )
      -- Tenant admin
      OR EXISTS (
        SELECT 1 FROM tenant_users tu
        WHERE tu.tenant_id = lesson_resources.tenant_id
          AND tu.user_id = (SELECT auth.uid())
          AND tu.role::text = 'admin'
      )
      -- Student with active access to the lesson's course (entitlements model)
      OR EXISTS (
        SELECT 1 FROM lessons l
        WHERE l.id = lesson_resources.lesson_id
          AND has_course_access((SELECT auth.uid()), l.course_id::integer)
      )
    )
  );

-- 3. Drop the legacy columns (their FKs drop with them) ---------------------
ALTER TABLE enrollments
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS subscription_id;
