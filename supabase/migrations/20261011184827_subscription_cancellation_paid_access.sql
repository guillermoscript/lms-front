-- Shared student subscription access contract. Provider adapters stop billing;
-- scheduled cancellation preserves the verified paid period. Explicit immediate
-- termination/refund remains terminal. Service-only RPCs serialize lifecycle
-- changes with payment receipt/renewal writes on the subscription row.
BEGIN;
CREATE OR REPLACE FUNCTION public.apply_subscription_cancellation(
  _subscription_id integer, _immediate boolean DEFAULT false,
  _provider_deadline timestamptz DEFAULT NULL
) RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE sub public.subscriptions%rowtype; deadline timestamptz;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE subscription_id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  -- Duplicate or late cancellation never reopens an ended subscription.
  IF sub.subscription_status IN ('canceled', 'expired') THEN RETURN sub.end_date; END IF;
  IF sub.cancel_at_period_end AND NOT _immediate THEN RETURN COALESCE(sub.cancel_at, sub.current_period_end, sub.end_date); END IF;
  deadline := COALESCE(sub.current_period_end, sub.end_date);
  IF _provider_deadline IS NOT NULL THEN deadline := LEAST(deadline, _provider_deadline); END IF;
  IF _immediate THEN deadline := LEAST(deadline, now()); END IF;
  UPDATE public.subscriptions SET
    cancel_at_period_end = NOT _immediate,
    cancel_at = CASE WHEN NOT _immediate THEN deadline ELSE NULL END,
    canceled_at = COALESCE(canceled_at, now()),
    provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) ||
      CASE WHEN _provider_deadline IS NOT NULL THEN jsonb_build_object('cancellation_deadline', _provider_deadline) ELSE '{}'::jsonb END,
    current_period_end = deadline, end_date = deadline,
    ended_at = CASE WHEN deadline <= now() THEN COALESCE(ended_at, now()) ELSE ended_at END,
    subscription_status = CASE WHEN deadline <= now() THEN 'canceled'::public.subscription_status
      WHEN subscription_status = 'renewed' THEN 'active'::public.subscription_status ELSE subscription_status END
  WHERE subscription_id = sub.subscription_id;
  UPDATE public.entitlements SET expires_at = LEAST(expires_at, deadline)
    WHERE source_type = 'subscription' AND source_id = sub.subscription_id;
  RETURN deadline;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_subscription_if_due(
  _subscription_id integer, _allow_unscheduled boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE sub public.subscriptions%rowtype; deadline timestamptz;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE subscription_id = _subscription_id FOR UPDATE;
  IF NOT FOUND OR sub.subscription_status NOT IN ('active', 'renewed', 'past_due') THEN RETURN false; END IF;
  IF NOT sub.cancel_at_period_end AND NOT _allow_unscheduled THEN RETURN false; END IF;
  deadline := CASE WHEN sub.cancel_at_period_end THEN COALESCE(sub.cancel_at, sub.current_period_end, sub.end_date)
    ELSE GREATEST(sub.current_period_end, sub.end_date) END;
  IF deadline IS NULL OR deadline > now() THEN RETURN false; END IF;
  UPDATE public.subscriptions SET subscription_status = 'expired', ended_at = now()
    WHERE subscription_id = sub.subscription_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_subscription(_subscription_id integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.subscriptions SET cancel_at_period_end = false, cancel_at = NULL,
    canceled_at = NULL, provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'cancellation_deadline'
  WHERE subscription_id = _subscription_id AND subscription_status IN ('active','renewed','past_due')
    AND cancel_at_period_end AND COALESCE(current_period_end, end_date) > now();
  RETURN FOUND;
END;
$$;

-- The old DB cron expired *all* active providers, including Stripe while a
-- renewal webhook was delayed. Scheduled cancellations are owned by this shared
-- rule; unscheduled self-managed expiry remains capability-gated by the API job.
CREATE OR REPLACE FUNCTION public.handle_student_subscription_expiry()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE id integer;
BEGIN
  FOR id IN SELECT subscription_id FROM public.subscriptions
    WHERE cancel_at_period_end AND subscription_status IN ('active','renewed','past_due')
  LOOP PERFORM public.expire_subscription_if_due(id); END LOOP;
END;
$$;

-- All paid-period writers use this rule. A delayed activation/renewal cannot
-- resurrect an ended/refunded subscription. A paid renewal racing with a cancel
-- keeps its schedule; the access deadline follows the verified paid period.
CREATE OR REPLACE FUNCTION public.apply_paid_subscription_period(
  _subscription_id integer, _period_end timestamptz, _period_start timestamptz DEFAULT NULL,
  _allow_realign boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE sub public.subscriptions%rowtype; deadline timestamptz;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE subscription_id = _subscription_id FOR UPDATE;
  IF NOT FOUND OR sub.subscription_status NOT IN ('active','renewed','past_due') THEN RETURN false; END IF;
  deadline := CASE WHEN _allow_realign THEN _period_end ELSE GREATEST(sub.current_period_end, sub.end_date, _period_end) END;
  -- A scheduled provider's end is authoritative. Late payment can repair access
  -- only inside it; a payment beyond it is a reconciliation/refund liability.
  IF sub.cancel_at_period_end AND sub.provider_metadata->>'cancellation_deadline' IS NOT NULL THEN
    deadline := LEAST(deadline, (sub.provider_metadata->>'cancellation_deadline')::timestamptz);
  END IF;
  UPDATE public.subscriptions SET current_period_end = deadline, end_date = deadline,
    cancel_at = CASE WHEN cancel_at_period_end THEN deadline ELSE NULL END,
    current_period_start = GREATEST(_period_start, current_period_start),
    subscription_status = 'active', ended_at = NULL,
    provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'renewal_error' - 'renewal_pending'
  WHERE subscription_id = sub.subscription_id;
  UPDATE public.entitlements SET status = 'active', expires_at = deadline, revoked_at = NULL
    WHERE source_type = 'subscription' AND source_id = sub.subscription_id AND status <> 'revoked';
  RETURN true;
END;
$$;
create or replace function public.apply_webhook_subscription_period(
  _provider text,
  _provider_event_id text,
  _provider_subscription_id text,
  _new_period_end timestamptz,
  _allow_period_realign boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row public.subscriptions%rowtype;
  inserted_effect boolean;
begin
  if _provider_event_id is null or _provider_event_id = '' then
    raise exception 'provider event id is required' using errcode = '22023';
  end if;
  if _new_period_end is null then return false; end if;

  select * into subscription_row
  from public.subscriptions
  where provider_subscription_id = _provider_subscription_id
    and payment_provider = _provider
  for update;
  if not found then
    raise exception 'subscription not found for % %', _provider, _provider_subscription_id
      using errcode = 'P0002';
  end if;

  insert into public.webhook_business_effects (
    provider, provider_event_id, effect_type, target_id
  ) values (
    _provider, _provider_event_id, 'student_subscription_period', subscription_row.subscription_id::text
  )
  on conflict (provider, provider_event_id, effect_type, target_id) do nothing;
  inserted_effect := found;
  if not inserted_effect then return false; end if;

  return public.apply_paid_subscription_period(subscription_row.subscription_id,
    _new_period_end, NULL, _allow_period_realign AND NOT EXISTS (
      SELECT 1 FROM public.webhook_business_effects WHERE provider = _provider
        AND effect_type = 'student_subscription_period'
        AND target_id = subscription_row.subscription_id::text
        AND provider_event_id <> _provider_event_id));
end;
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
    PERFORM public.apply_paid_subscription_period(sub.subscription_id, _period_end, _period_start);

  ELSE
    UPDATE public.subscriptions SET subscription_status = 'past_due',
      provider_metadata = provider_metadata || jsonb_build_object('renewal_error',
        jsonb_build_object('code', _error_code, 'attempted_at', now(), 'period_start', _period_start))
    WHERE subscription_id = sub.subscription_id AND subscription_status IN ('active', 'past_due')
      AND NOT cancel_at_period_end AND (current_period_end IS NULL OR current_period_end <= _period_start);
    -- Preserve the paid-through deadline. Expired access stays expired until a
    -- confirmed retry; do not grant an unpaid grace period.
  END IF;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_solana_renewal(_subscription_id integer, _period_start timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.subscriptions SET provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) ||
    jsonb_build_object('renewal_pending', jsonb_build_object('period_start', _period_start, 'attempted_at', now()))
  WHERE subscription_id = _subscription_id AND payment_provider = 'solana_subs'
    AND subscription_status IN ('active','past_due') AND NOT cancel_at_period_end
    AND (current_period_end IS NULL OR current_period_end <= _period_start);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_subscription_cancellation(integer,boolean,timestamptz),
 public.resume_subscription(integer),
 public.expire_subscription_if_due(integer,boolean),
 public.apply_paid_subscription_period(integer,timestamptz,timestamptz,boolean),
 public.begin_solana_renewal(integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_cancellation(integer,boolean,timestamptz),
 public.resume_subscription(integer),
 public.expire_subscription_if_due(integer,boolean),
 public.apply_paid_subscription_period(integer,timestamptz,timestamptz,boolean),
 public.begin_solana_renewal(integer,timestamptz) TO service_role;
COMMIT;
