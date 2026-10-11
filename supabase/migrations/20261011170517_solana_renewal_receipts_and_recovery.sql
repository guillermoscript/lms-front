-- Native Solana renewal receipts have their own state transition. Generic
-- purchase triggers must neither cancel a failed retry nor add a plan-duration
-- period to a charge already measured against the on-chain hourly period.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_solana_renewal_period_unique
ON public.transactions (provider_subscription_id, (provider_metadata->>'period_start'))
WHERE payment_provider = 'solana_subs' AND provider_metadata->>'kind' = 'renewal';

CREATE OR REPLACE FUNCTION public.trigger_manage_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _course_id INTEGER;
BEGIN
  IF NEW.user_id IS NULL OR (NEW.payment_provider = 'solana_subs' AND NEW.provider_metadata->>'kind' = 'renewal') THEN
    RETURN NEW;
  END IF;

  -- Product purchase → enroll in linked courses
  IF NEW.product_id IS NOT NULL THEN
    SELECT course_id INTO _course_id
    FROM public.product_courses
    WHERE product_id = NEW.product_id;
    IF FOUND AND NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.enroll_user(NEW.user_id, NEW.product_id);
    END IF;
  END IF;

  -- Plan purchase or renewal
  IF NEW.plan_id IS NOT NULL THEN
    IF NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.handle_new_subscription(NEW.user_id, NEW.plan_id, NEW.transaction_id);
    ELSIF NEW.status = 'failed'::public.transaction_status THEN
      PERFORM public.cancel_subscription(NEW.user_id, NEW.plan_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.record_solana_renewal(
  _subscription_id integer,
  _period_start timestamptz,
  _period_end timestamptz,
  _amount numeric,
  _successful boolean,
  _signatures jsonb DEFAULT '[]'::jsonb,
  _error_code text DEFAULT NULL,
  _network text DEFAULT 'mainnet-beta',
  _paid_at timestamptz DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  sub public.subscriptions%rowtype;
  receipt public.transactions%rowtype;
  receipt_id integer;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE subscription_id = _subscription_id FOR UPDATE;
  IF NOT FOUND OR sub.payment_provider <> 'solana_subs' THEN
    RAISE EXCEPTION 'Solana subscription not found';
  END IF;
  IF _period_end <= _period_start OR _amount <= 0 OR _network NOT IN ('devnet', 'testnet', 'mainnet-beta') THEN
    RAISE EXCEPTION 'Invalid renewal terms';
  END IF;
  IF _successful AND (jsonb_typeof(_signatures) <> 'array' OR jsonb_array_length(_signatures) = 0) THEN
    RAISE EXCEPTION 'Confirmed payment signatures required';
  END IF;
  SELECT * INTO receipt FROM public.transactions
    WHERE payment_provider = 'solana_subs'
      AND provider_subscription_id = sub.provider_subscription_id
      AND provider_metadata->>'kind' = 'renewal'
      AND provider_metadata->>'period_start' = _period_start::text;
  IF FOUND AND receipt.status = 'successful' THEN
    IF _successful AND _paid_at IS NOT NULL THEN
      UPDATE public.transactions SET transaction_date = _paid_at,
        provider_metadata = provider_metadata || jsonb_build_object('confirmed_at', _paid_at)
      WHERE transaction_id = receipt.transaction_id;
    END IF;
    RETURN receipt.transaction_id;
  END IF;
  -- A late failed worker must never downgrade a settled period or a canceled row.
  IF NOT _successful AND sub.subscription_status NOT IN ('active', 'past_due') THEN RETURN NULL; END IF;
  INSERT INTO public.transactions (
    user_id, tenant_id, plan_id, amount, currency, payment_method, payment_provider,
    provider_subscription_id, provider_charge_id, status, provider_metadata, transaction_date
  ) VALUES (
    sub.user_id, sub.tenant_id, sub.plan_id, _amount, 'usd', 'USDC', 'solana_subs',
    sub.provider_subscription_id,
    CASE WHEN _successful THEN _signatures->>0 ELSE NULL END,
    CASE WHEN _successful THEN 'successful'::public.transaction_status ELSE 'failed'::public.transaction_status END,
    jsonb_build_object('kind', 'renewal', 'period_start', _period_start::text,
      'period_end', _period_end::text, 'signatures', _signatures, 'error_code', _error_code,
      'confirmed_at', CASE WHEN _successful THEN COALESCE(_paid_at, now()) ELSE NULL END,
      'network', _network, 'subscriber', sub.provider_metadata->>'subscriber'),
    CASE WHEN _successful THEN COALESCE(_paid_at, now()) ELSE now() END
  ) ON CONFLICT (provider_subscription_id, (provider_metadata->>'period_start'))
    WHERE payment_provider = 'solana_subs' AND provider_metadata->>'kind' = 'renewal'
  DO UPDATE SET status = EXCLUDED.status, provider_charge_id = EXCLUDED.provider_charge_id,
    provider_metadata = EXCLUDED.provider_metadata, transaction_date = EXCLUDED.transaction_date
  RETURNING transaction_id INTO receipt_id;
  IF _successful THEN
    UPDATE public.subscriptions SET subscription_status = 'active',
      current_period_start = _period_start, current_period_end = _period_end,
      end_date = _period_end, ended_at = NULL,
      provider_metadata = provider_metadata - 'renewal_error'
    WHERE subscription_id = sub.subscription_id AND subscription_status IN ('active', 'past_due')
      AND (current_period_end IS NULL OR current_period_end <= _period_end);
    IF FOUND THEN
      UPDATE public.entitlements SET status = 'active', expires_at = _period_end, revoked_at = NULL
      WHERE source_type = 'subscription' AND source_id = sub.subscription_id;
    END IF;
  ELSE
    UPDATE public.subscriptions SET subscription_status = 'past_due',
      provider_metadata = provider_metadata || jsonb_build_object('renewal_error',
        jsonb_build_object('code', _error_code, 'attempted_at', now(), 'period_start', _period_start))
    WHERE subscription_id = sub.subscription_id AND subscription_status IN ('active', 'past_due');
    -- Preserve the paid-through deadline. Expired access stays expired until a
    -- confirmed retry; do not grant an unpaid grace period.
  END IF;
  RETURN receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_solana_renewal(integer,timestamptz,timestamptz,numeric,boolean,jsonb,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_solana_renewal(integer,timestamptz,timestamptz,numeric,boolean,jsonb,text,text,timestamptz) TO service_role;
COMMIT;
