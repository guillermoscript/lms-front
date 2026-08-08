-- Real-Postgres atomicity proof for issue #623. All fixture changes roll back.
begin;

create or replace function pg_temp.issue_623_fail_write()
returns trigger
language plpgsql
as $$
begin
  if current_setting('issue623.fail_table', true) = tg_table_name then
    raise exception 'issue #623 injected failure at %', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger issue_623_fail_subscription
before insert or update on public.platform_subscriptions
for each row execute function pg_temp.issue_623_fail_write();

create trigger issue_623_fail_tenant
before update on public.tenants
for each row execute function pg_temp.issue_623_fail_write();

create trigger issue_623_fail_split
before insert or update on public.revenue_splits
for each row execute function pg_temp.issue_623_fail_write();

create trigger issue_623_fail_request
before update on public.platform_payment_requests
for each row execute function pg_temp.issue_623_fail_write();

create trigger issue_623_fail_switch
before update on public.platform_subscription_switches
for each row execute function pg_temp.issue_623_fail_write();

do $$
declare
  actor_id uuid;
  non_admin_id uuid;
  tenant_key uuid;
  source_plan_id uuid;
  target_plan_id uuid;
  target_plan_slug text;
  target_fee numeric;
  request_key uuid;
  switch_key uuid;
  fail_table text;
  before_sub jsonb;
  before_tenant jsonb;
  before_split jsonb;
  after_sub jsonb;
  after_tenant jsonb;
  after_split jsonb;
  first_result record;
  replay_result record;
  confirmed_actor uuid;
  confirmed_time timestamptz;
  jan_period record;
  leap_period record;
  dst_period record;
begin
  select sa.user_id into actor_id
  from public.super_admins sa
  order by sa.created_at nulls last
  limit 1;

  select t.id into tenant_key
  from public.tenants t
  order by t.created_at nulls last
  limit 1;

  select pp.plan_id into source_plan_id
  from public.platform_plans pp
  where pp.slug = 'pro'
  limit 1;

  select pp.plan_id, pp.slug, pp.transaction_fee_percent
  into target_plan_id, target_plan_slug, target_fee
  from public.platform_plans pp
  where pp.slug = 'business'
  limit 1;

  if actor_id is null or tenant_key is null or source_plan_id is null or target_plan_id is null then
    raise exception 'issue #623 SQL test requires a super admin, tenant, Pro plan, and Business plan';
  end if;

  insert into public.platform_subscriptions (
    tenant_id,
    plan_id,
    status,
    payment_provider,
    interval,
    provider_subscription_id,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    updated_at
  ) values (
    tenant_key,
    source_plan_id,
    'active',
    'manual',
    'monthly',
    null,
    timestamptz '2026-07-01 00:00:00+00',
    timestamptz '2026-09-01 00:00:00+00',
    false,
    clock_timestamp()
  )
  on conflict (tenant_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    payment_provider = excluded.payment_provider,
    interval = excluded.interval,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = excluded.updated_at;

  update public.tenants t
  set plan = 'pro',
      billing_status = 'active',
      billing_period_end = timestamptz '2026-09-01 00:00:00+00'
  where t.id = tenant_key;

  insert into public.revenue_splits (
    tenant_id, platform_percentage, school_percentage, updated_at
  ) values (
    tenant_key, 2, 98, clock_timestamp()
  )
  on conflict (tenant_id) do update set
    platform_percentage = excluded.platform_percentage,
    school_percentage = excluded.school_percentage,
    updated_at = excluded.updated_at;

  select to_jsonb(ps) into before_sub
  from public.platform_subscriptions ps
  where ps.tenant_id = tenant_key;
  select to_jsonb(t) into before_tenant
  from public.tenants t
  where t.id = tenant_key;
  select to_jsonb(rs) into before_split
  from public.revenue_splits rs
  where rs.tenant_id = tenant_key;

  foreach fail_table in array array[
    'platform_subscriptions',
    'tenants',
    'revenue_splits',
    'platform_payment_requests'
  ] loop
    insert into public.platform_payment_requests (
      tenant_id,
      plan_id,
      requested_by,
      interval,
      amount,
      currency,
      status,
      request_type,
      payment_provider,
      bank_reference,
      proof_url,
      expires_at
    ) values (
      tenant_key,
      target_plan_id,
      actor_id,
      'monthly',
      79,
      'usd',
      'payment_received',
      'upgrade',
      'manual',
      'ISSUE-623-' || fail_table,
      'proofs/issue-623-' || fail_table || '.png',
      clock_timestamp() + interval '1 day'
    ) returning request_id into request_key;

    perform set_config('issue623.fail_table', fail_table, true);
    begin
      perform * from public.confirm_platform_payment_request(request_key, actor_id);
      raise exception 'issue #623 expected injected failure at %', fail_table;
    exception
      when others then
        if sqlerrm not like 'issue #623 injected failure at %' then
          raise;
        end if;
    end;
    perform set_config('issue623.fail_table', '', true);

    if (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'payment_received' then
      raise exception 'request changed after injected % failure', fail_table;
    end if;
    if (select ppr.confirmed_by from public.platform_payment_requests ppr where ppr.request_id = request_key) is not null then
      raise exception 'confirmation actor leaked after injected % failure', fail_table;
    end if;

    select to_jsonb(ps) into after_sub
    from public.platform_subscriptions ps
    where ps.tenant_id = tenant_key;
    select to_jsonb(t) into after_tenant
    from public.tenants t
    where t.id = tenant_key;
    select to_jsonb(rs) into after_split
    from public.revenue_splits rs
    where rs.tenant_id = tenant_key;

    if after_sub is distinct from before_sub
       or after_tenant is distinct from before_tenant
       or after_split is distinct from before_split then
      raise exception 'partial billing state remained after injected % failure', fail_table;
    end if;
  end loop;

  -- Switch promotion writes subscription, tenant, split, and switch state before
  -- request confirmation. A failure at the final switch-ledger update must undo
  -- all preceding promotion writes.
  update public.platform_subscriptions ps
  set payment_provider = 'stripe',
      provider_subscription_id = 'issue-623-source-sub',
      plan_id = source_plan_id
  where ps.tenant_id = tenant_key;

  insert into public.platform_subscription_switches (
    tenant_id,
    source_subscription_id,
    source_plan_id,
    source_payment_provider,
    source_provider_subscription_id,
    source_period_end,
    target_plan_id,
    target_payment_provider,
    target_interval,
    state,
    initiated_by,
    expires_at
  )
  select
    tenant_key,
    ps.subscription_id,
    source_plan_id,
    'stripe',
    'issue-623-source-sub',
    ps.current_period_end,
    target_plan_id,
    'manual',
    'monthly',
    'pending_activation',
    actor_id,
    clock_timestamp() + interval '1 hour'
  from public.platform_subscriptions ps
  where ps.tenant_id = tenant_key
  returning platform_subscription_switches.switch_id into switch_key;

  insert into public.platform_payment_requests (
    tenant_id,
    plan_id,
    requested_by,
    interval,
    amount,
    currency,
    status,
    request_type,
    payment_provider,
    switch_id,
    expires_at
  ) values (
    tenant_key,
    target_plan_id,
    actor_id,
    'monthly',
    79,
    'usd',
    'payment_received',
    'upgrade',
    'manual',
    switch_key,
    clock_timestamp() + interval '1 day'
  ) returning request_id into request_key;

  select to_jsonb(ps) into before_sub
  from public.platform_subscriptions ps
  where ps.tenant_id = tenant_key;
  select to_jsonb(t) into before_tenant
  from public.tenants t
  where t.id = tenant_key;
  select to_jsonb(rs) into before_split
  from public.revenue_splits rs
  where rs.tenant_id = tenant_key;

  perform set_config('issue623.fail_table', 'platform_subscription_switches', true);
  begin
    perform * from public.confirm_platform_payment_request(request_key, actor_id);
    raise exception 'issue #623 expected injected switch failure';
  exception
    when others then
      if sqlerrm not like 'issue #623 injected failure at %' then
        raise;
      end if;
  end;
  perform set_config('issue623.fail_table', '', true);

  if (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'payment_received'
     or (select pss.state from public.platform_subscription_switches pss where pss.switch_id = switch_key) <> 'pending_activation' then
    raise exception 'request or switch state changed after injected switch failure';
  end if;

  select to_jsonb(ps) into after_sub
  from public.platform_subscriptions ps
  where ps.tenant_id = tenant_key;
  select to_jsonb(t) into after_tenant
  from public.tenants t
  where t.id = tenant_key;
  select to_jsonb(rs) into after_split
  from public.revenue_splits rs
  where rs.tenant_id = tenant_key;
  if after_sub is distinct from before_sub
     or after_tenant is distinct from before_tenant
     or after_split is distinct from before_split then
    raise exception 'partial billing state remained after injected switch failure';
  end if;

  -- A request linked to a switch with a different target plan must not mutate
  -- either record even though both rows are otherwise open/current.
  insert into public.platform_payment_requests (
    tenant_id, plan_id, requested_by, interval, amount, currency,
    status, request_type, payment_provider, switch_id, expires_at
  ) values (
    tenant_key, source_plan_id, actor_id, 'monthly', 29, 'usd',
    'payment_received', 'upgrade', 'manual', switch_key,
    clock_timestamp() + interval '1 day'
  ) returning request_id into request_key;

  begin
    perform * from public.confirm_platform_payment_request(request_key, actor_id);
    raise exception 'issue #623 expected switch target mismatch refusal';
  exception
    when others then
      if sqlerrm <> 'Subscription switch no longer matches the payment request' then
        raise;
      end if;
  end;
  if (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'payment_received' then
    raise exception 'switch target mismatch changed request state';
  end if;

  begin
    perform * from public.confirm_platform_payment_request(gen_random_uuid(), actor_id);
    raise exception 'issue #623 expected missing request refusal';
  exception
    when no_data_found then null;
  end;

  -- Terminal requests cannot cross back into an open/confirmed state.
  foreach fail_table in array array['rejected', 'expired'] loop
    insert into public.platform_payment_requests (
      tenant_id, plan_id, requested_by, interval, amount, currency,
      status, request_type, payment_provider, expires_at
    ) values (
      tenant_key, target_plan_id, actor_id, 'monthly', 79, 'usd',
      fail_table, 'upgrade', 'manual', clock_timestamp() - interval '1 day'
    ) returning request_id into request_key;

    begin
      perform * from public.confirm_platform_payment_request(request_key, actor_id);
      raise exception 'issue #623 expected terminal % refusal', fail_table;
    exception
      when others then
        if sqlerrm not like initcap(fail_table) || '% cannot be confirmed' then
          raise;
        end if;
    end;
  end loop;

  -- TTL is authoritative even before the daily expiry cron persists status.
  insert into public.platform_payment_requests (
    tenant_id, plan_id, requested_by, interval, amount, currency,
    status, request_type, payment_provider, expires_at
  ) values (
    tenant_key, target_plan_id, actor_id, 'monthly', 79, 'usd',
    'payment_received', 'upgrade', 'manual', clock_timestamp() - interval '1 second'
  ) returning request_id into request_key;

  begin
    perform * from public.confirm_platform_payment_request(request_key, actor_id);
    raise exception 'issue #623 expected lapsed open request refusal';
  exception
    when others then
      if sqlerrm <> 'Expired payments cannot be confirmed' then
        raise;
      end if;
  end;
  if (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'payment_received' then
    raise exception 'lapsed open request changed state during refusal';
  end if;

  select au.id into non_admin_id
  from auth.users au
  where not exists (
    select 1 from public.super_admins sa where sa.user_id = au.id
  )
  order by au.created_at
  limit 1;

  if non_admin_id is not null then
    insert into public.platform_payment_requests (
      tenant_id, plan_id, requested_by, interval, amount, currency,
      status, request_type, payment_provider, expires_at
    ) values (
      tenant_key, target_plan_id, actor_id, 'monthly', 79, 'usd',
      'payment_received', 'upgrade', 'manual', clock_timestamp() + interval '1 day'
    ) returning request_id into request_key;

    begin
      perform * from public.confirm_platform_payment_request(request_key, non_admin_id);
      raise exception 'issue #623 expected non-super-admin refusal';
    exception
      when insufficient_privilege then null;
    end;

    if (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'payment_received' then
      raise exception 'unauthorized actor changed payment request state';
    end if;
  end if;

  -- Successful confirmation is applied once, preserves its audit stamp, and
  -- leaves the request's money/proof fields intact on replay.
  update public.platform_subscriptions ps
  set payment_provider = 'manual', provider_subscription_id = null
  where ps.tenant_id = tenant_key;

  insert into public.platform_payment_requests (
    tenant_id,
    plan_id,
    requested_by,
    interval,
    amount,
    currency,
    status,
    request_type,
    payment_provider,
    bank_reference,
    proof_url,
    expires_at
  ) values (
    tenant_key,
    target_plan_id,
    actor_id,
    'monthly',
    79,
    'usd',
    'payment_received',
    'renewal',
    'manual',
    'ISSUE-623-SUCCESS',
    'proofs/issue-623-success.png',
    clock_timestamp() + interval '1 day'
  ) returning request_id into request_key;

  select * into first_result
  from public.confirm_platform_payment_request(request_key, actor_id);
  select ppr.confirmed_by, ppr.confirmed_at
  into confirmed_actor, confirmed_time
  from public.platform_payment_requests ppr
  where ppr.request_id = request_key;
  select * into replay_result
  from public.confirm_platform_payment_request(request_key, actor_id);

  if not first_result.applied or replay_result.applied then
    raise exception 'confirmation/replay applied flags are wrong';
  end if;
  if first_result.period_end <> replay_result.period_end
     or confirmed_actor is distinct from actor_id
     or confirmed_time is distinct from replay_result.confirmed_at then
    raise exception 'confirmation replay changed period or audit fields';
  end if;
  if (select ppr.amount from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 79
     or (select ppr.currency from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'usd'
     or (select ppr.bank_reference from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'ISSUE-623-SUCCESS'
     or (select ppr.proof_url from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'proofs/issue-623-success.png' then
    raise exception 'confirmation changed immutable money/proof audit fields';
  end if;
  if (select t.billing_period_end from public.tenants t where t.id = tenant_key) is distinct from first_result.period_end
     or (select rs.platform_percentage from public.revenue_splits rs where rs.tenant_id = tenant_key) is distinct from target_fee
     or (select t.plan from public.tenants t where t.id = tenant_key) is distinct from target_plan_slug then
    raise exception 'successful confirmation left entitlement/accounting mirrors inconsistent';
  end if;

  -- Every UI-open source state is accepted by the same database contract.
  foreach fail_table in array array['pending', 'instructions_sent', 'payment_received'] loop
    insert into public.platform_payment_requests (
      tenant_id, plan_id, requested_by, interval, amount, currency,
      status, request_type, payment_provider, expires_at
    ) values (
      tenant_key, target_plan_id, actor_id, 'monthly', 79, 'usd',
      fail_table, 'upgrade', 'manual', clock_timestamp() + interval '1 day'
    ) returning request_id into request_key;

    select * into first_result
    from public.confirm_platform_payment_request(request_key, actor_id);
    if not first_result.applied
       or (select ppr.status from public.platform_payment_requests ppr where ppr.request_id = request_key) <> 'confirmed' then
      raise exception 'allowed source status % did not confirm', fail_table;
    end if;
  end loop;

  -- PostgreSQL calendar intervals clamp month/leap-day boundaries. These fixed
  -- values pin the shared UTC-safe helper used by both manual and webhook paths.
  select * into jan_period
  from public.calculate_platform_billing_period(
    null, 'monthly', false, timestamptz '2025-01-31 12:00:00+00'
  );
  select * into leap_period
  from public.calculate_platform_billing_period(
    null, 'yearly', false, timestamptz '2024-02-29 12:00:00+00'
  );

  perform set_config('TimeZone', 'America/New_York', true);
  select * into dst_period
  from public.calculate_platform_billing_period(
    null, 'monthly', false, timestamptz '2026-02-08 06:30:00+00'
  );
  perform set_config('TimeZone', 'UTC', true);

  if jan_period.period_end <> timestamptz '2025-02-28 12:00:00+00'
     or leap_period.period_end <> timestamptz '2025-02-28 12:00:00+00'
     or dst_period.period_end <> timestamptz '2026-03-08 06:30:00+00' then
    raise exception 'shared billing-period calendar contract changed';
  end if;
end;
$$;

rollback;
