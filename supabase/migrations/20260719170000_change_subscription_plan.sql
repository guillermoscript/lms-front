-- Student plan-change (supersession) primitive — issue #463 (part of #458).
--
-- Lets a student move to a different plan without ever holding two live
-- subscriptions. `subscriptions` rows are normally built by the
-- `trigger_manage_transactions` → `handle_new_subscription` path, which since
-- #459 RAISEs `parallel_subscription` when a different-plan live sub already
-- exists — so a switch cannot go through the ordinary checkout path. This RPC
-- performs the switch directly and atomically, bypassing that trigger:
--
--   1. Cancel the caller's current live subscription (status → 'canceled', which
--      fires handle_subscription_status_change → expires its entitlements) and
--      NULL its provider_subscription_id, so renewal/cancel webhooks matched by
--      (provider_subscription_id, payment_provider) can never resurrect it.
--   2. Activate the new plan — reactivating an existing (user, new_plan) row when
--      one exists (UNIQUE(user_id, plan_id)) or inserting a fresh one — carrying
--      the old sub's provider fields (the SAME provider subscription for a native
--      in-place swap; NULL for self-managed providers) and its transaction_id
--      (NOT NULL). The period is carried from the old sub (period-aligned); the
--      client never supplies a period.
--   3. Grant entitlements for the new plan's courses (mirrors
--      handle_new_subscription). Courses shared with the old plan keep access via
--      a fresh active entitlement; old-only courses were expired in step 1.
--
-- The billing side (native item/variant swap + proration on Stripe/LS) is done
-- by the server action BEFORE calling this RPC; self-managed providers
-- (manual/solana) settle any price difference offline.

-- Supersession lineage: which subscription replaced this one (NULL for normal
-- cancels/expiries). Additive and nullable.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS superseded_by integer
  REFERENCES public.subscriptions(subscription_id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.change_subscription_plan(_new_plan_id integer)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _uid        uuid := auth.uid();
    _now        timestamptz := now();
    _old        subscriptions;
    _new        subscriptions;
    _tenant     uuid;
    _plan_tenant uuid;
    _plan_deleted timestamptz;
    _duration   integer;
    _end        timestamptz;
    _rec        RECORD;
BEGIN
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- Resolve the target plan FIRST — its tenant is authoritative. Deriving the
    -- tenant from the plan (not from an arbitrary "most recent" sub) keeps this
    -- correct for users who are members of more than one school: the sub we
    -- supersede is the caller's live one IN THE TARGET PLAN'S TENANT, matching
    -- what the server action validated.
    SELECT p.tenant_id, p.deleted_at, p.duration_in_days
      INTO _plan_tenant, _plan_deleted, _duration
      FROM plans p
     WHERE p.plan_id = _new_plan_id;

    IF _plan_tenant IS NULL THEN
        RAISE EXCEPTION 'invalid_plan';
    END IF;
    IF _plan_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'plan_deleted';
    END IF;
    _tenant := _plan_tenant;

    -- Current live subscription (the one being switched away from), scoped to the
    -- caller AND the target plan's tenant — this RPC can never touch another
    -- user's subscription, nor a live sub the caller holds in a different school.
    SELECT * INTO _old
      FROM subscriptions
     WHERE user_id = _uid
       AND tenant_id = _tenant
       AND subscription_status IN ('active', 'renewed', 'past_due')
     ORDER BY created DESC
     LIMIT 1;

    IF _old.subscription_id IS NULL THEN
        RAISE EXCEPTION 'no_active_subscription';
    END IF;

    IF _old.plan_id = _new_plan_id THEN
        RAISE EXCEPTION 'same_plan';
    END IF;

    -- Period-aligned: carry the old sub's remaining period. Never trust a
    -- client-supplied period (this function is callable by any authenticated
    -- user). A native in-place swap keeps the provider's billing cycle, so this
    -- matches; a later renewal webhook corrects it if it ever diverges.
    _end := COALESCE(_old.current_period_end, _old.end_date,
                     _now + make_interval(days => COALESCE(_duration, 30)));

    -- 1) Supersede the old subscription.
    UPDATE subscriptions
       SET subscription_status  = 'canceled',
           cancel_at_period_end = false,
           canceled_at          = _now,
           ended_at             = _now,
           provider_subscription_id = NULL
     WHERE subscription_id = _old.subscription_id;

    -- 2) Activate the new plan (reactivate existing row or insert), carrying the
    --    old sub's provider fields + transaction_id.
    SELECT * INTO _new
      FROM subscriptions
     WHERE user_id = _uid AND plan_id = _new_plan_id
     LIMIT 1;

    IF _new.subscription_id IS NOT NULL THEN
        UPDATE subscriptions
           SET subscription_status   = 'active',
               tenant_id             = _tenant,
               start_date            = _now,
               current_period_start  = _now,
               current_period_end    = _end,
               end_date              = _end,
               cancel_at             = NULL,
               cancel_at_period_end  = false,
               canceled_at           = NULL,
               ended_at              = NULL,
               payment_provider         = _old.payment_provider,
               provider_subscription_id = _old.provider_subscription_id,
               transaction_id           = _old.transaction_id,
               superseded_by            = NULL
         WHERE subscription_id = _new.subscription_id
        RETURNING * INTO _new;
    ELSE
        INSERT INTO subscriptions (
            user_id, plan_id, tenant_id, start_date, current_period_start,
            current_period_end, end_date, subscription_status, transaction_id,
            payment_provider, provider_subscription_id, created, ended_at
        )
        VALUES (
            _uid, _new_plan_id, _tenant, _now, _now,
            _end, _end, 'active', _old.transaction_id,
            _old.payment_provider, _old.provider_subscription_id, _now, NULL
        )
        RETURNING * INTO _new;
    END IF;

    -- 3) Record supersession lineage on the old row.
    UPDATE subscriptions
       SET superseded_by = _new.subscription_id
     WHERE subscription_id = _old.subscription_id;

    -- 4) Grant entitlements for the new plan's courses (mirror
    --    handle_new_subscription). Shared courses keep access; old-only courses
    --    were expired by the status-change trigger in step 1.
    FOR _rec IN SELECT pc.course_id FROM plan_courses pc WHERE pc.plan_id = _new_plan_id
    LOOP
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_uid, _rec.course_id, _tenant, 'subscription', _new.subscription_id, 'active', _end)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status = 'active', expires_at = EXCLUDED.expires_at, revoked_at = NULL, tenant_id = EXCLUDED.tenant_id;
    END LOOP;

    RETURN _new;
END;
$function$;

-- Callable by the subscription owner (SECURITY DEFINER scopes writes to
-- auth.uid()); service_role for admin/testing. Never anon.
REVOKE ALL ON FUNCTION public.change_subscription_plan(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.change_subscription_plan(integer) TO authenticated, service_role;
