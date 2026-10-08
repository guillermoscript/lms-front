-- Rollback for 20261009110000_platform_fee_gate_929.sql (issue #929).
--
-- Removes the sales gate (trigger + helper functions), restores
-- grant_free_entitlement() to its 20260716225213 body and unschedules the
-- enforce-platform-fees pg_cron job. Deploy app code that no longer calls
-- assertSalesOpen()/transaction_sales_gate_allows first, or the pre-check
-- fails open (by design) and logs an error on every checkout.
--
-- NOT REVERSIBLE: the 'ves' value on public.currency_type. PostgreSQL cannot
-- drop an enum value (no ALTER TYPE ... DROP VALUE). It is left in place; it
-- is harmless while unused. Removing it would require recreating the type and
-- rewriting every column that uses it (transactions, products, plans, ...),
-- which is deliberately not done here.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-platform-fees-daily') THEN
    PERFORM cron.unschedule('enforce-platform-fees-daily');
  END IF;
END $$;

DROP TRIGGER IF EXISTS before_transaction_fee_sales_block_insert ON public.transactions;
DROP FUNCTION IF EXISTS public.enforce_fee_sales_block();

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

DROP FUNCTION IF EXISTS public.free_enrollment_allowed(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.transaction_sales_gate_allows(uuid, uuid, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.is_preblock_request_settlement(uuid, uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.is_subscription_renewal(uuid, uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.fee_gate_in_flight_max_age_days();
DROP FUNCTION IF EXISTS public.fee_gate_self_managed_renewal_window_days();
