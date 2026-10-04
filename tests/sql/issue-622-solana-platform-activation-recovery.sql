-- Real-Postgres failure/replay proof for issue #622. All mutations roll back.
begin;

do $$
declare
  tenant_key uuid;
  plan_key uuid;
  plan_slug text;
  user_key uuid;
  request_a constant uuid := '62200000-0000-0000-0000-000000000001';
  request_b constant uuid := '62200000-0000-0000-0000-000000000002';
  token_a constant uuid := '62200000-0000-0000-0000-000000000011';
  token_b constant uuid := '62200000-0000-0000-0000-000000000012';
  signature_a constant text := 'issue-622-solana-signature-A';
  observation text;
  claim text;
  attempts integer;
  failure_state text;
  first_applied boolean;
  replay_applied boolean;
  first_period_end timestamptz;
  replay_period_end timestamptz;
begin
  select tenant.id, plan.plan_id, plan.slug
  into tenant_key, plan_key, plan_slug
  from public.tenants tenant
  cross join public.platform_plans plan
  where plan.slug <> 'free'
  order by tenant.created_at, plan.sort_order
  limit 1;

  select id into user_key from auth.users order by created_at limit 1;

  if tenant_key is null or plan_key is null or user_key is null then
    raise exception 'issue #622 SQL test needs a tenant, paid platform plan, and auth user fixture';
  end if;

  insert into public.platform_payment_requests (
    request_id, tenant_id, plan_id, requested_by, interval, amount, currency,
    status, payment_provider, provider_reference, settlement_currency,
    settlement_base, expires_at
  ) values
    (
      request_a, tenant_key, plan_key, user_key, 'monthly', 9, 'usd',
      'pending', 'solana', 'issue-622-reference-A', 'usdc', 9000000,
      clock_timestamp() + interval '1 hour'
    ),
    (
      request_b, tenant_key, plan_key, user_key, 'monthly', 9, 'usd',
      'pending', 'solana', 'issue-622-reference-B', 'usdc', 9000000,
      clock_timestamp() + interval '1 hour'
    );

  select result.observation_status into observation
  from public.observe_solana_platform_payment(request_a, tenant_key, signature_a) result;
  if observation <> 'observed' then
    raise exception 'first signature observation returned %, expected observed', observation;
  end if;

  select result.claim_status, result.current_attempt_count
  into claim, attempts
  from public.claim_solana_platform_activation(request_a, token_a, 300, 5) result;
  if claim <> 'claimed' or attempts <> 1 then
    raise exception 'first activation lease returned % attempt %, expected claimed/1', claim, attempts;
  end if;

  -- Entitlement commits, then the worker dies before completing its request
  -- lease. The replay must see the same durable period and apply no second one.
  select result.applied, result.period_end
  into first_applied, first_period_end
  from public.apply_self_managed_platform_period(
    'solana', signature_a, tenant_key, plan_key, plan_slug, 'monthly', signature_a, null
  ) result;
  if not first_applied then
    raise exception 'first entitlement activation did not apply';
  end if;

  update public.platform_payment_requests
  set activation_lease_expires_at = clock_timestamp() - interval '1 second'
  where request_id = request_a;

  select result.claim_status, result.current_attempt_count
  into claim, attempts
  from public.claim_solana_platform_activation(request_a, token_b, 300, 5) result;
  if claim <> 'claimed' or attempts <> 2 then
    raise exception 'stale-lease takeover returned % attempt %, expected claimed/2', claim, attempts;
  end if;

  select result.applied, result.period_end
  into replay_applied, replay_period_end
  from public.apply_self_managed_platform_period(
    'solana', signature_a, tenant_key, plan_key, plan_slug, 'monthly', signature_a, null
  ) result;
  if replay_applied or replay_period_end <> first_period_end then
    raise exception 'replay duplicated period: applied %, first %, replay %',
      replay_applied, first_period_end, replay_period_end;
  end if;

  if public.complete_solana_platform_activation(request_a, token_a) then
    raise exception 'stale worker completed after losing its lease token';
  end if;
  if not public.complete_solana_platform_activation(request_a, token_b) then
    raise exception 'current worker could not complete activation';
  end if;

  select result.claim_status into claim
  from public.claim_solana_platform_activation(
    request_a, '62200000-0000-0000-0000-000000000013', 300, 5
  ) result;
  if claim <> 'activated' then
    raise exception 'completed replay returned %, expected activated', claim;
  end if;

  -- The same signature cannot settle a second request. The loser becomes a
  -- durable terminal-invalid record rather than retrying a payment it does not own.
  select result.observation_status into observation
  from public.observe_solana_platform_payment(request_b, tenant_key, signature_a) result;
  if observation <> 'signature_conflict' then
    raise exception 'duplicate signature returned %, expected signature_conflict', observation;
  end if;
  if not exists (
    select 1 from public.platform_payment_requests
    where request_id = request_b
      and status = 'rejected'
      and activation_state = 'terminal_invalid'
      and activation_last_error is not null
  ) then
    raise exception 'duplicate-signature request was not parked terminal-invalid';
  end if;

  -- Failure release is retryable and token-fenced.
  update public.platform_payment_requests
  set activation_state = 'processing',
      status = 'payment_received',
      provider_charge_id = 'issue-622-solana-signature-B',
      activation_token = token_a,
      activation_attempt_count = 1
  where request_id = request_b;

  failure_state := public.fail_solana_platform_activation(
    request_b, token_b, 'stale failure', 0, 5
  );
  if failure_state <> 'ownership_lost' then
    raise exception 'stale failure returned %, expected ownership_lost', failure_state;
  end if;

  failure_state := public.fail_solana_platform_activation(
    request_b, token_a, 'injected activation failure', 0, 5
  );
  if failure_state <> 'failed_retryable' then
    raise exception 'owned failure returned %, expected failed_retryable', failure_state;
  end if;
end;
$$;

rollback;
