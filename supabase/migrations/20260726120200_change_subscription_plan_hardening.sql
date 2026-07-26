-- change_subscription_plan hardening — issue #545 (EPIC #540 §2.2), bugs 2 + 3.
--
-- Replaces the body shipped in 20260719170000_change_subscription_plan.sql.
-- The supersession semantics (cancel the old sub, activate the new one, carry
-- the period, re-grant entitlements) are unchanged; four defects are fixed.
--
-- 1. `cancel_at = NULL` on a NOT NULL column (`20260719170000:124`).
--    The reactivate-existing-row branch is taken whenever a row already exists
--    for (user, new_plan) in ANY status — which is exactly what step 1 of this
--    same function leaves behind (old row set to 'canceled', never deleted). So
--    EVERY switch back to a previously-held plan failed with 23502 and the
--    canonical Basic → Pro → Basic downgrade always aborted. `cancel_at` is
--    nullable as of 20260726120000, which makes NULL the correct value here.
--
-- 2. No advisory lock. Two concurrent calls (a double-click; the dialog's
--    `pending` disable is per-tab only) could both read the same live
--    subscription and race. `grant_free_subscription` already takes
--    pg_advisory_xact_lock for the same reason; this takes one keyed on
--    (user, tenant) so the second call blocks, then sees the state the first
--    committed and raises `same_plan` — and the server action no longer
--    compensates on that, so the provider and our DB end up agreeing.
--
-- 3. A free plan could be switched to a paid one with no payment. Nothing
--    compared prices — not this function, not the checkout action, not the
--    billing page's plan list. Activate a free plan (one click, subscribeFree,
--    which sets current_period_end = 2126-01-01), open Billing → Change plan,
--    pick the school's paid manual/bank-transfer plan, and this function wrote
--    `entitlements … expires_at = 2126-01-01` for every course in that plan
--    with no transaction and no payment_requests row for an admin to
--    reconcile. Manual/offline is the primary LATAM flow, so this was not a
--    corner tenant. An upgrade is now refused unless the provider settles the
--    difference itself (Stripe / Lemon Squeezy prorate the in-place swap the
--    server action performs before calling this).
--
--    The comparison is on raw `plans.price`, deliberately NOT price-per-day:
--    the period is CARRIED from the old subscription, never extended, so
--    switching a $19/30d subscription onto a $190/365d plan hands over the
--    pricier plan's courses for the remaining prepaid days. Raw price is the
--    right conservative test for "is the student asking for more than they
--    paid for".
--
-- 4. A scheduled cancel was silently discarded. The new row was written with
--    `cancel_at_period_end = false, canceled_at = NULL` regardless of the old
--    row's state, while `lib/payments/stripe-provider.ts` swaps the item and
--    proration only and never clears Stripe's own cancel_at_period_end. Cancel
--    → switch therefore left our DB showing "Renews on" while Stripe still
--    terminated the subscription, and the reactivate affordance was hidden
--    because the flag read false. The pending cancel is now carried onto the
--    new row, so the two agree and the student can still resume.

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
    _new_price  numeric;
    _old_price  numeric;
    _settles_natively boolean;
    _carry_cancel boolean;
    _end        timestamptz;
    _rec        RECORD;
    -- Free plans never expire (mirrors grant_free_subscription's horizon).
    _far_future CONSTANT timestamptz := timestamptz '2126-01-01 00:00:00+00';
BEGIN
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- Resolve the target plan FIRST — its tenant is authoritative. Deriving the
    -- tenant from the plan (not from an arbitrary "most recent" sub) keeps this
    -- correct for users who are members of more than one school: the sub we
    -- supersede is the caller's live one IN THE TARGET PLAN'S TENANT, matching
    -- what the server action validated.
    SELECT p.tenant_id, p.deleted_at, p.duration_in_days, p.price
      INTO _plan_tenant, _plan_deleted, _duration, _new_price
      FROM plans p
     WHERE p.plan_id = _new_plan_id;

    IF _plan_tenant IS NULL THEN
        RAISE EXCEPTION 'invalid_plan';
    END IF;
    IF _plan_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'plan_deleted';
    END IF;
    _tenant := _plan_tenant;

    -- Serialize concurrent plan changes for this (user, tenant) — a double
    -- click must not have two calls reading the same live subscription. Taken
    -- BEFORE the read so the loser sees the winner's committed state.
    PERFORM pg_advisory_xact_lock(hashtext(_uid::text || ':' || _tenant::text));

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

    -- Price authority. Only a provider that settles the mid-period difference
    -- itself may be moved onto a more expensive plan by a supersession: the
    -- server action swaps the item on the SAME provider subscription with
    -- proration before calling us, so the student is actually charged. Every
    -- other provider (manual / bank transfer / one-time crypto) settles
    -- offline, and nothing in this path creates a transaction or a
    -- payment_requests row — so an upgrade there is an unpaid grant.
    SELECT p.price INTO _old_price FROM plans p WHERE p.plan_id = _old.plan_id;
    _settles_natively := _old.payment_provider IN ('stripe', 'lemonsqueezy')
                         AND _old.provider_subscription_id IS NOT NULL;

    IF NOT _settles_natively AND COALESCE(_new_price, 0) > COALESCE(_old_price, 0) THEN
        RAISE EXCEPTION 'upgrade_requires_payment';
    END IF;

    -- Period-aligned: carry the old sub's remaining period. Never trust a
    -- client-supplied period (this function is callable by any authenticated
    -- user). A native in-place swap keeps the provider's billing cycle, so this
    -- matches; a later renewal webhook corrects it if it ever diverges.
    _end := COALESCE(_old.current_period_end, _old.end_date,
                     _now + make_interval(days => COALESCE(_duration, 30)));

    -- A pending cancel is the student's standing intent and Stripe still holds
    -- it (the in-place swap does not clear cancel_at_period_end there), so it
    -- rides along to the new plan rather than being silently dropped.
    _carry_cancel := COALESCE(_old.cancel_at_period_end, false);

    -- Switching ONTO a free plan: nothing bills, so there is nothing to cancel,
    -- and free subscriptions never expire (same horizon grant_free_subscription
    -- uses) — otherwise the student's free plan would lapse when the prepaid
    -- period of the plan they left runs out, with no way to re-activate it.
    IF COALESCE(_new_price, 0) = 0 THEN
        _end := _far_future;
        _carry_cancel := false;
    END IF;

    -- 1) Supersede the old subscription. Its cancel schedule goes with it —
    --    cancel_at must not outlive the flag (#545 contract).
    UPDATE subscriptions
       SET subscription_status  = 'canceled',
           cancel_at_period_end = false,
           cancel_at            = NULL,
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
               cancel_at_period_end  = _carry_cancel,
               cancel_at             = CASE WHEN _carry_cancel THEN _end ELSE NULL END,
               canceled_at           = CASE WHEN _carry_cancel THEN COALESCE(_old.canceled_at, _now) ELSE NULL END,
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
            payment_provider, provider_subscription_id, created, ended_at,
            cancel_at_period_end, cancel_at, canceled_at
        )
        VALUES (
            _uid, _new_plan_id, _tenant, _now, _now,
            _end, _end, 'active', _old.transaction_id,
            _old.payment_provider, _old.provider_subscription_id, _now, NULL,
            _carry_cancel,
            CASE WHEN _carry_cancel THEN _end ELSE NULL END,
            CASE WHEN _carry_cancel THEN COALESCE(_old.canceled_at, _now) ELSE NULL END
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
