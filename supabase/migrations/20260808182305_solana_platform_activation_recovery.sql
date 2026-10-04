-- Durable Solana platform-payment activation (issue #622).
--
-- On-chain observation and entitlement activation cannot share one transaction:
-- the latter runs application orchestration and may call provider APIs during a
-- subscription switch. Persist the observed payment first, then lease the
-- replay-safe dispatcher. A crashed worker can be reclaimed after its lease;
-- token-fenced completion prevents that stale worker from winning later.

alter table public.platform_payment_requests
  add column payment_observed_at timestamptz,
  add column activation_state text check (activation_state in (
    'observed', 'processing', 'activated', 'failed_retryable', 'terminal_invalid'
  )),
  add column activation_attempt_count integer not null default 0
    check (activation_attempt_count >= 0),
  add column activation_last_error text,
  add column activation_next_retry_at timestamptz,
  add column activation_started_at timestamptz,
  add column activation_lease_expires_at timestamptz,
  add column activation_token uuid,
  add column activation_alerted_at timestamptz,
  add column activated_at timestamptz;

comment on column public.platform_payment_requests.activation_state is
  'Durable entitlement state for observed Solana platform payments. NULL for rails that do not use this worker.';
comment on column public.platform_payment_requests.activation_token is
  'Lease-fencing token. Only the worker holding this token may complete or fail an activation attempt.';

create index platform_payment_requests_solana_activation_queue
  on public.platform_payment_requests (
    activation_state,
    activation_next_retry_at,
    activation_lease_expires_at,
    payment_observed_at
  )
  where payment_provider = 'solana'
    and activation_state in ('observed', 'processing', 'failed_retryable');

-- Preserve genuinely completed historical payments, but put any legacy row
-- that was marked confirmed before its replay-safe business effect landed back
-- into the recovery queue. This repairs existing money-without-service rows
-- instead of blessing them as activated during deployment.
with classified as (
  select
    request.request_id,
    (
      exists (
        select 1
        from public.webhook_business_effects effect
        where effect.provider = 'solana'
          and effect.provider_event_id = request.provider_charge_id
          and effect.effect_type = 'self_managed_platform_period'
          and effect.target_id = request.tenant_id::text
      )
      or exists (
        select 1
        from public.platform_subscriptions subscription
        where subscription.tenant_id = request.tenant_id
          and subscription.payment_provider = 'solana'
          and subscription.provider_subscription_id = request.provider_charge_id
          and subscription.status = 'active'
      )
      or exists (
        select 1
        from public.platform_subscription_switches switch
        where switch.switch_id = request.switch_id
          and switch.target_payment_provider = 'solana'
          and switch.target_provider_subscription_id = request.provider_charge_id
          and switch.state <> 'pending_activation'
      )
    ) as was_activated
  from public.platform_payment_requests request
  where request.payment_provider = 'solana'
    and request.status = 'confirmed'
    and request.provider_charge_id is not null
)
update public.platform_payment_requests request
set payment_observed_at = coalesce(request.confirmed_at, request.updated_at, request.created_at, clock_timestamp()),
    activation_state = case when classified.was_activated then 'activated' else 'failed_retryable' end,
    activated_at = case when classified.was_activated then coalesce(request.confirmed_at, request.updated_at) end,
    status = case when classified.was_activated then 'confirmed' else 'payment_received' end,
    confirmed_at = case when classified.was_activated then request.confirmed_at end,
    activation_last_error = case
      when classified.was_activated then null
      else 'Legacy confirmed Solana payment requires entitlement reconciliation'
    end,
    activation_next_retry_at = case when classified.was_activated then null else clock_timestamp() end
from classified
where request.request_id = classified.request_id;

create or replace function public.observe_solana_platform_payment(
  _request_id uuid,
  _tenant_id uuid,
  _signature text
)
returns table (
  observation_status text,
  current_activation_state text,
  current_signature text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.platform_payment_requests%rowtype;
begin
  if _signature is null or btrim(_signature) = '' then
    raise exception 'Solana signature is required' using errcode = '22023';
  end if;

  select * into request_row
  from public.platform_payment_requests
  where request_id = _request_id
    and tenant_id = _tenant_id
  for update;

  if not found or request_row.payment_provider <> 'solana' then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if request_row.activation_state = 'activated' or request_row.status = 'confirmed' then
    return query select
      case when request_row.provider_charge_id = _signature then 'activated' else 'signature_mismatch' end,
      'activated'::text,
      request_row.provider_charge_id;
    return;
  end if;

  if request_row.activation_state = 'terminal_invalid'
     or request_row.status in ('rejected', 'expired') then
    return query select 'terminal_invalid'::text, 'terminal_invalid'::text, request_row.provider_charge_id;
    return;
  end if;

  if request_row.provider_charge_id is not null
     and request_row.provider_charge_id <> _signature then
    return query select 'signature_mismatch'::text, request_row.activation_state, request_row.provider_charge_id;
    return;
  end if;

  begin
    update public.platform_payment_requests
    set provider_charge_id = _signature,
        status = 'payment_received',
        payment_observed_at = coalesce(payment_observed_at, clock_timestamp()),
        activation_state = coalesce(activation_state, 'observed'),
        updated_at = clock_timestamp()
    where request_id = _request_id
    returning * into request_row;
  exception
    when unique_violation then
      update public.platform_payment_requests
      set status = 'rejected',
          activation_state = 'terminal_invalid',
          activation_last_error = 'On-chain signature already settled another request',
          activation_next_retry_at = null,
          updated_at = clock_timestamp()
      where request_id = _request_id
      returning * into request_row;

      return query select 'signature_conflict'::text, request_row.activation_state, request_row.provider_charge_id;
      return;
  end;

  return query select 'observed'::text, request_row.activation_state, request_row.provider_charge_id;
end;
$$;

create or replace function public.claim_solana_platform_activation(
  _request_id uuid,
  _claim_token uuid,
  _lease_seconds integer default 300,
  _max_attempts integer default 5
)
returns table (
  claim_status text,
  current_activation_state text,
  current_attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.platform_payment_requests%rowtype;
begin
  if _claim_token is null then
    raise exception 'Activation claim token is required' using errcode = '22023';
  end if;
  if _lease_seconds < 1 or _max_attempts < 1 then
    raise exception 'Lease seconds and max attempts must be positive' using errcode = '22023';
  end if;

  select * into request_row
  from public.platform_payment_requests
  where request_id = _request_id
  for update;

  if not found or request_row.payment_provider <> 'solana'
     or request_row.provider_charge_id is null then
    return query select 'not_found'::text, null::text, 0;
    return;
  end if;

  if request_row.activation_state = 'activated' or request_row.status = 'confirmed' then
    return query select 'activated'::text, 'activated'::text, request_row.activation_attempt_count;
    return;
  end if;

  if request_row.activation_state = 'terminal_invalid'
     or request_row.status in ('rejected', 'expired') then
    return query select 'terminal_invalid'::text, 'terminal_invalid'::text, request_row.activation_attempt_count;
    return;
  end if;

  if request_row.activation_state = 'processing'
     and request_row.activation_lease_expires_at > clock_timestamp() then
    return query select 'processing'::text, 'processing'::text, request_row.activation_attempt_count;
    return;
  end if;

  if request_row.activation_state = 'failed_retryable'
     and request_row.activation_next_retry_at > clock_timestamp() then
    return query select 'retry_later'::text, 'failed_retryable'::text, request_row.activation_attempt_count;
    return;
  end if;

  if request_row.activation_attempt_count >= _max_attempts then
    return query select 'attempts_exhausted'::text, 'failed_retryable'::text, request_row.activation_attempt_count;
    return;
  end if;

  update public.platform_payment_requests
  set activation_state = 'processing',
      activation_attempt_count = activation_attempt_count + 1,
      activation_started_at = clock_timestamp(),
      activation_lease_expires_at = clock_timestamp() + make_interval(secs => _lease_seconds),
      activation_token = _claim_token,
      activation_next_retry_at = null,
      updated_at = clock_timestamp()
  where request_id = _request_id
  returning * into request_row;

  return query select 'claimed'::text, request_row.activation_state, request_row.activation_attempt_count;
end;
$$;

create or replace function public.complete_solana_platform_activation(
  _request_id uuid,
  _claim_token uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with completed as (
    update public.platform_payment_requests
    set activation_state = 'activated',
        status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, clock_timestamp()),
        activated_at = coalesce(activated_at, clock_timestamp()),
        activation_last_error = null,
        activation_next_retry_at = null,
        activation_started_at = null,
        activation_lease_expires_at = null,
        activation_token = null,
        updated_at = clock_timestamp()
    where request_id = _request_id
      and activation_state = 'processing'
      and activation_token = _claim_token
    returning request_id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_solana_platform_activation(
  _request_id uuid,
  _claim_token uuid,
  _last_error text,
  _retry_delay_seconds integer default 60,
  _max_attempts integer default 5
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.platform_payment_requests%rowtype;
begin
  if _retry_delay_seconds < 0 or _max_attempts < 1 then
    raise exception 'Retry delay must be non-negative and max attempts positive' using errcode = '22023';
  end if;

  update public.platform_payment_requests
  set activation_state = 'failed_retryable',
      activation_last_error = left(coalesce(_last_error, 'Unknown activation error'), 2000),
      activation_next_retry_at = case
        when activation_attempt_count >= _max_attempts then null
        else clock_timestamp() + make_interval(secs => _retry_delay_seconds)
      end,
      activation_started_at = null,
      activation_lease_expires_at = null,
      activation_token = null,
      updated_at = clock_timestamp()
  where request_id = _request_id
    and activation_state = 'processing'
    and activation_token = _claim_token
  returning * into request_row;

  if not found then return 'ownership_lost'; end if;
  if request_row.activation_attempt_count >= _max_attempts then return 'attempts_exhausted'; end if;
  return 'failed_retryable';
end;
$$;

revoke all on function public.observe_solana_platform_payment(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.claim_solana_platform_activation(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_solana_platform_activation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_solana_platform_activation(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.observe_solana_platform_payment(uuid, uuid, text)
  to service_role;
grant execute on function public.claim_solana_platform_activation(uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.complete_solana_platform_activation(uuid, uuid)
  to service_role;
grant execute on function public.fail_solana_platform_activation(uuid, uuid, text, integer, integer)
  to service_role;
