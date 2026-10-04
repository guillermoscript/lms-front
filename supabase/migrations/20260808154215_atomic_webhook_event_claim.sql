-- Atomically lease webhook events before any billing side effect is dispatched.
-- The unique ledger row remains the audit record; a random token fences stale
-- workers so only the current lease owner can complete or release an attempt.

alter table public.webhook_events
  add column if not exists processing_token uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_lease_expires_at timestamptz,
  add column if not exists last_error text;

alter table public.webhook_events
  drop constraint if exists webhook_events_attempt_count_nonnegative;

alter table public.webhook_events
  add constraint webhook_events_attempt_count_nonnegative
  check (attempt_count >= 0);

comment on column public.webhook_events.processing_token is
  'Random token owned by the current/last processing attempt. Completion and failure are fenced by this token.';
comment on column public.webhook_events.attempt_count is
  'Number of processing leases granted for this provider event.';
comment on column public.webhook_events.processing_started_at is
  'Start of the active processing lease. NULL means an explicit failure released the event for immediate retry.';
comment on column public.webhook_events.processing_lease_expires_at is
  'Expiry chosen by the lease owner at claim time. Challengers cannot shorten an active owner''s lease.';
comment on column public.webhook_events.last_error is
  'Most recent dispatch error, retained for audit even after a later successful retry.';

create or replace function public.claim_webhook_event(
  _provider text,
  _provider_event_id text,
  _event_type text,
  _payload jsonb,
  _claim_token uuid,
  _lease_seconds integer default 300
)
returns table (
  event_id uuid,
  claim_status text,
  current_attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed public.webhook_events%rowtype;
  claim_time timestamptz := clock_timestamp();
  bounded_lease_seconds integer := greatest(1, least(coalesce(_lease_seconds, 300), 3600));
begin
  if _provider is null or _provider = '' or _provider_event_id is null or _provider_event_id = '' then
    raise exception 'provider and provider event id are required' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider,
    provider_event_id,
    event_type,
    payload,
    processing_token,
    attempt_count,
    processing_started_at,
    processing_lease_expires_at
  )
  values (
    _provider,
    _provider_event_id,
    _event_type,
    coalesce(_payload, '{}'::jsonb),
    _claim_token,
    1,
    claim_time,
    claim_time + make_interval(secs => bounded_lease_seconds)
  )
  on conflict (provider, provider_event_id) do nothing
  returning * into claimed;

  if found then
    return query select claimed.id, 'claimed'::text, claimed.attempt_count;
    return;
  end if;

  update public.webhook_events as event
  set processing_token = _claim_token,
      processing_started_at = claim_time,
      processing_lease_expires_at = claim_time + make_interval(secs => bounded_lease_seconds),
      attempt_count = event.attempt_count + 1,
      event_type = coalesce(_event_type, event.event_type),
      payload = coalesce(_payload, event.payload)
  where event.provider = _provider
    and event.provider_event_id = _provider_event_id
    and event.processed_at is null
    and (
      event.processing_started_at is null
      or event.processing_lease_expires_at is null
      or event.processing_lease_expires_at <= claim_time
    )
  returning event.* into claimed;

  if found then
    return query select claimed.id, 'claimed'::text, claimed.attempt_count;
    return;
  end if;

  select event.*
  into claimed
  from public.webhook_events as event
  where event.provider = _provider
    and event.provider_event_id = _provider_event_id;

  return query
  select
    claimed.id,
    case when claimed.processed_at is not null then 'completed' else 'processing' end,
    claimed.attempt_count;
end;
$$;

create or replace function public.complete_webhook_event(
  _event_id uuid,
  _claim_token uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with completed as (
    update public.webhook_events
    set processed_at = clock_timestamp()
    where id = _event_id
      and processing_token = _claim_token
      and processed_at is null
    returning id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_webhook_event(
  _event_id uuid,
  _claim_token uuid,
  _last_error text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with failed as (
    update public.webhook_events
    set processing_started_at = null,
        processing_lease_expires_at = null,
        last_error = left(coalesce(_last_error, 'Unknown dispatch error'), 4000),
        error = left(coalesce(_last_error, 'Unknown dispatch error'), 4000)
    where id = _event_id
      and processing_token = _claim_token
      and processed_at is null
    returning id
  )
  select exists(select 1 from failed);
$$;

-- Durable business-effect ledger. Unlike a single "last event" column, this
-- remains correct for A,B,A replay order and lets an RPC combine dedupe with
-- the accounting/period write in one transaction.
create table if not exists public.webhook_business_effects (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  effect_type text not null,
  target_id text not null,
  applied_at timestamptz not null default now(),
  constraint webhook_business_effects_unique
    unique (provider, provider_event_id, effect_type, target_id)
);

alter table public.webhook_business_effects enable row level security;

create or replace function public.claim_webhook_business_effect(
  _provider text,
  _provider_event_id text,
  _effect_type text,
  _target_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.webhook_business_effects (
    provider, provider_event_id, effect_type, target_id
  ) values (
    _provider, _provider_event_id, _effect_type, _target_id
  )
  on conflict (provider, provider_event_id, effect_type, target_id) do nothing;
  return found;
end;
$$;

create or replace function public.apply_webhook_refund(
  _provider text,
  _provider_event_id text,
  _transaction_id bigint,
  _refund_amount numeric
)
returns table (
  applied boolean,
  refunded_amount numeric,
  is_full_refund boolean,
  user_id uuid,
  product_id bigint,
  plan_id bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transaction_row public.transactions%rowtype;
  inserted_effect boolean;
begin
  select * into transaction_row
  from public.transactions
  where transaction_id = _transaction_id
  for update;

  if not found then
    raise exception 'refund transaction % not found', _transaction_id using errcode = 'P0002';
  end if;

  if transaction_row.status = 'pending' then
    raise exception 'refund transaction % is still pending', _transaction_id using errcode = '40001';
  end if;

  if transaction_row.status <> 'successful' then
    return query select false, transaction_row.refunded_amount,
      transaction_row.status = 'refunded', transaction_row.user_id,
      transaction_row.product_id::bigint, transaction_row.plan_id::bigint;
    return;
  end if;

  insert into public.webhook_business_effects (
    provider, provider_event_id, effect_type, target_id
  ) values (
    _provider, _provider_event_id, 'refund', _transaction_id::text
  )
  on conflict (provider, provider_event_id, effect_type, target_id) do nothing;
  inserted_effect := found;

  if inserted_effect and transaction_row.status = 'successful' then
    update public.transactions
    set refunded_amount = least(
          transaction_row.amount,
          transaction_row.refunded_amount + greatest(coalesce(_refund_amount, transaction_row.amount), 0)
        ),
        status = case
          when least(
            transaction_row.amount,
            transaction_row.refunded_amount + greatest(coalesce(_refund_amount, transaction_row.amount), 0)
          ) >= transaction_row.amount - 0.005
          then 'refunded'::public.transaction_status
          else 'successful'::public.transaction_status
        end
    where transaction_id = _transaction_id
    returning * into transaction_row;

    if transaction_row.product_id is not null and transaction_row.status = 'refunded' then
      update public.entitlements as entitlement
      set status = 'revoked', revoked_at = clock_timestamp()
      where entitlement.user_id = transaction_row.user_id
        and entitlement.source_type = 'product'
        and entitlement.source_id = transaction_row.product_id;
    end if;
  end if;

  return query select
    inserted_effect,
    transaction_row.refunded_amount,
    transaction_row.status = 'refunded',
    transaction_row.user_id,
    transaction_row.product_id::bigint,
    transaction_row.plan_id::bigint;
end;
$$;

create or replace function public.apply_self_managed_platform_period(
  _provider text,
  _provider_event_id text,
  _tenant_id uuid,
  _plan_id uuid,
  _plan_slug text,
  _interval text,
  _provider_subscription_id text default null,
  _provider_customer_id text default null
)
returns table (
  applied boolean,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row public.platform_subscriptions%rowtype;
  inserted_effect boolean;
  start_at timestamptz;
  end_at timestamptz;
  platform_fee numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(_tenant_id::text, 625));

  select * into subscription_row
  from public.platform_subscriptions
  where tenant_id = _tenant_id;

  insert into public.webhook_business_effects (
    provider, provider_event_id, effect_type, target_id
  ) values (
    _provider, _provider_event_id, 'self_managed_platform_period', _tenant_id::text
  )
  on conflict (provider, provider_event_id, effect_type, target_id) do nothing;
  inserted_effect := found;

  if inserted_effect then
    start_at := case
      when subscription_row.current_period_end > clock_timestamp()
      then subscription_row.current_period_end
      else clock_timestamp()
    end;
    end_at := start_at + case
      when _interval = 'yearly' then interval '1 year'
      else interval '1 month'
    end;

    insert into public.platform_subscriptions (
      tenant_id,
      plan_id,
      status,
      payment_provider,
      interval,
      provider_subscription_id,
      provider_customer_id,
      current_period_start,
      current_period_end,
      updated_at
    ) values (
      _tenant_id,
      _plan_id,
      'active',
      _provider,
      case when _interval = 'yearly' then 'yearly' else 'monthly' end,
      _provider_subscription_id,
      _provider_customer_id,
      start_at,
      end_at,
      clock_timestamp()
    )
    on conflict (tenant_id) do update set
      plan_id = excluded.plan_id,
      status = 'active',
      payment_provider = excluded.payment_provider,
      interval = excluded.interval,
      provider_subscription_id = coalesce(excluded.provider_subscription_id, public.platform_subscriptions.provider_subscription_id),
      provider_customer_id = coalesce(excluded.provider_customer_id, public.platform_subscriptions.provider_customer_id),
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = false,
      canceled_at = null,
      grace_period_end = null,
      renewal_reminder_sent_at = null,
      updated_at = excluded.updated_at
    returning * into subscription_row;
  elsif subscription_row.tenant_id is null then
    raise exception 'self-managed subscription missing for replayed event %', _provider_event_id
      using errcode = 'P0002';
  end if;

  if inserted_effect then
    update public.tenants
    set billing_status = 'active',
        plan = coalesce(_plan_slug, plan),
        billing_period_end = subscription_row.current_period_end,
        updated_at = clock_timestamp()
    where id = _tenant_id;

    select transaction_fee_percent into platform_fee
    from public.platform_plans
    where plan_id = _plan_id;

    if platform_fee is not null then
      insert into public.revenue_splits (
        tenant_id, platform_percentage, school_percentage, updated_at
      ) values (
        _tenant_id, platform_fee, 100 - platform_fee, clock_timestamp()
      )
      on conflict (tenant_id) do update set
        platform_percentage = excluded.platform_percentage,
        school_percentage = excluded.school_percentage,
        updated_at = excluded.updated_at;
    end if;
  end if;

  return query select
    inserted_effect,
    subscription_row.current_period_start,
    subscription_row.current_period_end;
end;
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
  effective_end timestamptz;
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

  effective_end := case
    when _allow_period_realign then _new_period_end
    else greatest(coalesce(subscription_row.current_period_end, _new_period_end), _new_period_end)
  end;

  update public.subscriptions
  set end_date = effective_end,
      current_period_end = effective_end,
      subscription_status = 'active',
      ended_at = null
  where subscription_id = subscription_row.subscription_id;

  update public.entitlements
  set expires_at = effective_end, status = 'active', revoked_at = null
  where source_type = 'subscription'
    and source_id = subscription_row.subscription_id;

  return true;
end;
$$;

revoke all on function public.claim_webhook_event(text, text, text, jsonb, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.complete_webhook_event(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_webhook_event(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.apply_webhook_refund(text, text, bigint, numeric)
  from public, anon, authenticated;
revoke all on function public.claim_webhook_business_effect(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_self_managed_platform_period(text, text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_webhook_subscription_period(text, text, text, timestamptz, boolean)
  from public, anon, authenticated;

grant execute on function public.claim_webhook_event(text, text, text, jsonb, uuid, integer)
  to service_role;
grant execute on function public.complete_webhook_event(uuid, uuid)
  to service_role;
grant execute on function public.fail_webhook_event(uuid, uuid, text)
  to service_role;
grant execute on function public.apply_webhook_refund(text, text, bigint, numeric)
  to service_role;
grant execute on function public.claim_webhook_business_effect(text, text, text, text)
  to service_role;
grant execute on function public.apply_self_managed_platform_period(text, text, uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.apply_webhook_subscription_period(text, text, text, timestamptz, boolean)
  to service_role;
