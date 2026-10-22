-- Security audit: "free" must not mean "has no product".
--
-- 1. A course sold ONLY through a plan (rows in plan_courses, no product_courses)
--    passed the old "no linked product with price <> 0" test, so any active
--    member could self-enroll it for free through grant_free_entitlement().
--    The function now also refuses a course that belongs to any non-deleted,
--    priced (price > 0) plan of the tenant. Courses/plans that are genuinely
--    free (no product, no plan, or only price-0 ones) keep working.
--
-- 2. ON CONFLICT DO UPDATE re-activated a free entitlement that staff had
--    revoked, handing access back on the next click. Rule: a 'free'
--    entitlement with status 'revoked' is final for self-service; only staff
--    (admin grant / delete the revoked row) can restore it. There is no
--    student self-revoke path for free entitlements, and status 'expired'
--    free rows remain re-grantable. Existing active rows stay idempotent.
--
-- grant_free_subscription() already pins plan price = 0 and deleted_at IS NULL
-- server-side, so it needs no change. Signature, SECURITY DEFINER, empty
-- search_path and the EXECUTE grants (authenticated only) are unchanged.

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

    -- A course sold only through a priced plan is not free either.
    IF EXISTS (
        SELECT 1
        FROM public.plan_courses AS plc
        JOIN public.plans AS pl
          ON pl.plan_id = plc.plan_id
        WHERE plc.course_id = _course_id
          AND pl.tenant_id = _tenant_id
          AND pl.deleted_at IS NULL
          AND pl.price > 0
    ) THEN
        RAISE EXCEPTION 'This course requires payment';
    END IF;

    -- Staff-revoked free access is not self-service re-grantable.
    IF EXISTS (
        SELECT 1
        FROM public.entitlements AS e
        WHERE e.user_id = _caller_id
          AND e.course_id = _course_id
          AND e.source_type = 'free'
          AND e.status = 'revoked'
    ) THEN
        RAISE EXCEPTION 'Access to this course was revoked';
    END IF;

    -- #929 fee gate: no NEW free enrollment while the school's sales are blocked.
    IF NOT public.free_enrollment_allowed(_tenant_id, _caller_id, _course_id) THEN
        RAISE EXCEPTION 'sales_blocked:fees' USING ERRCODE = 'LM003';
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
        tenant_id = EXCLUDED.tenant_id
    WHERE public.entitlements.status <> 'revoked';

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

-- Supabase default privileges also grant EXECUTE to anon; the body already
-- rejects a NULL auth.uid(), but an unauthenticated role has no business here.
REVOKE EXECUTE ON FUNCTION public.grant_free_entitlement(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_free_entitlement(uuid, integer) TO authenticated;
