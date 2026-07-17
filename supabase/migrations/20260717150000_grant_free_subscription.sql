-- #419 item 2: one-click activation of free (price = 0) plans.
--
-- Students cannot insert their own subscriptions under RLS, and
-- handle_new_subscription requires a transaction_id, so this SECURITY DEFINER
-- RPC creates a synthetic zero-amount transaction and lets the existing
-- after_transaction_insert trigger (trigger_manage_transactions →
-- handle_new_subscription) build the subscription + plan_courses entitlements
-- exactly like a paid confirmation. It then pushes the period end far into the
-- future so free subscriptions never expire (decision on #419: no renewal cron).

CREATE OR REPLACE FUNCTION public.grant_free_subscription(
  _user_id uuid,
  _plan_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned (not empty): the transactions trigger chain (trigger_manage_transactions
-- → handle_new_subscription) resolves unqualified names via search_path.
SET search_path = public
AS $$
DECLARE
  _plan RECORD;
  _subscription_id integer;
  _far_future timestamptz := timestamptz '2126-01-01 00:00:00+00';
BEGIN
  -- Callers can only grant to themselves.
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT plan_id, price, currency, tenant_id
    INTO _plan
    FROM public.plans
   WHERE plan_id = _plan_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  -- Server-side price authority: only genuinely free plans qualify.
  IF _plan.price <> 0 THEN
    RAISE EXCEPTION 'Plan is not free';
  END IF;

  -- Caller must be an active member of the plan's tenant.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE user_id = _user_id
       AND tenant_id = _plan.tenant_id
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not a member of this school';
  END IF;

  -- Serialize concurrent clicks for the same (user, plan).
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text || ':' || _plan_id::text));

  -- Idempotent: an existing active subscription means nothing to do.
  SELECT subscription_id INTO _subscription_id
    FROM public.subscriptions
   WHERE user_id = _user_id
     AND plan_id = _plan_id
     AND subscription_status = 'active'
     AND current_period_end > now();

  IF FOUND THEN
    RETURN;
  END IF;

  -- Synthetic zero-amount transaction; the after_transaction_insert trigger
  -- runs handle_new_subscription (subscription upsert + entitlements).
  INSERT INTO public.transactions
    (user_id, tenant_id, plan_id, amount, currency, payment_method, status)
  VALUES
    (_user_id, _plan.tenant_id, _plan_id, 0, COALESCE(_plan.currency, 'usd'), 'free', 'successful');

  SELECT subscription_id INTO _subscription_id
    FROM public.subscriptions
   WHERE user_id = _user_id
     AND plan_id = _plan_id;

  IF _subscription_id IS NULL THEN
    RAISE EXCEPTION 'Subscription creation failed';
  END IF;

  -- Free plans never expire: push period end (and entitlement expiry) far out.
  UPDATE public.subscriptions
     SET current_period_end = _far_future,
         end_date = _far_future,
         subscription_status = 'active'
   WHERE subscription_id = _subscription_id;

  UPDATE public.entitlements
     SET expires_at = _far_future
   WHERE source_type = 'subscription'
     AND source_id = _subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_free_subscription(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_free_subscription(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_free_subscription(uuid, integer) TO authenticated;
