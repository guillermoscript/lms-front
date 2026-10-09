-- Rollback for 20261009120000_platform_fee_hardening_929.sql (issue #929).
--
-- Restores is_preblock_request_settlement() and self_enroll_subscription_course()
-- to their previous bodies (20261009110000 / 20260516150000), and drops the
-- block-time snapshot, the created_at stamping trigger and
-- subscription_enrollment_allowed(). Deploy app code that no longer maps the
-- self-enroll LM003 first (harmless if not: the mapping simply never fires).
--
-- Re-opens the reviewed hole: the pre-block exemption trusts
-- payment_requests.created_at again.

DROP TRIGGER IF EXISTS after_tenant_fee_standing_block_snapshot ON public.tenant_fee_standing;
DROP FUNCTION IF EXISTS public.snapshot_fee_block_open_requests();

DROP TRIGGER IF EXISTS before_payment_request_stamp_created_at ON public.payment_requests;
DROP FUNCTION IF EXISTS public.stamp_payment_request_created_at();

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

DROP TABLE IF EXISTS public.fee_block_open_requests;

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

DROP FUNCTION IF EXISTS public.subscription_enrollment_allowed(uuid, uuid, integer);
