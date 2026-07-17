-- Harden the one-click free enrollment grant. Because this function is
-- SECURITY DEFINER, every authorization and pricing rule must be enforced
-- inside Postgres as well as in the calling server action.
CREATE OR REPLACE FUNCTION public.grant_free_entitlement(_user_id uuid, _course_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.grant_free_entitlement(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_free_entitlement(uuid, integer) TO authenticated;
