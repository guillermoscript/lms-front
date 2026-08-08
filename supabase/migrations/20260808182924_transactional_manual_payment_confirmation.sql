-- Atomic manual platform-payment confirmation (issue #623).
--
-- Confirmation is the money-to-entitlement boundary for an out-of-band
-- platform payment. Keep request state, subscription state, tenant entitlement,
-- billing period, revenue split, and switch promotion in one transaction.

alter table public.platform_payment_requests
  add column if not exists confirmed_period_start timestamptz,
  add column if not exists confirmed_period_end timestamptz;

comment on column public.platform_payment_requests.confirmed_period_start is
  'Billing period start produced by the successful atomic confirmation; retained for replay/audit.';
comment on column public.platform_payment_requests.confirmed_period_end is
  'Billing period end produced by the successful atomic confirmation; retained for replay/audit.';

create or replace function public.calculate_platform_billing_period(
  _current_period_end timestamptz,
  _interval text,
  _is_renewal boolean default true,
  _now timestamptz default clock_timestamp()
)
returns table (
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if _interval not in ('monthly', 'yearly') then
    raise exception 'Unsupported billing interval: %', _interval
      using errcode = '22023';
  end if;

  period_start := case
    when _is_renewal and _current_period_end > _now then _current_period_end
    else _now
  end;
  -- Calendar arithmetic on timestamptz otherwise uses the caller session's
  -- TimeZone and can shift the UTC instant across DST. Convert explicitly to a
  -- UTC wall-clock timestamp, add the calendar interval, then restore UTC.
  period_end := (
    (period_start at time zone 'UTC') + case
      when _interval = 'yearly' then interval '1 year'
      else interval '1 month'
    end
  ) at time zone 'UTC';

  return next;
end;
$$;

-- Replace #625's function so manual confirmations and self-managed webhooks
-- cannot drift into different calendar/UTC behavior.
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

  select ps.* into subscription_row
  from public.platform_subscriptions ps
  where ps.tenant_id = _tenant_id;

  insert into public.webhook_business_effects (
    provider, provider_event_id, effect_type, target_id
  ) values (
    _provider, _provider_event_id, 'self_managed_platform_period', _tenant_id::text
  )
  on conflict (provider, provider_event_id, effect_type, target_id) do nothing;
  inserted_effect := found;

  if inserted_effect then
    select p.period_start, p.period_end
    into start_at, end_at
    from public.calculate_platform_billing_period(
      subscription_row.current_period_end,
      _interval,
      true,
      clock_timestamp()
    ) p;

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
    on conflict on constraint platform_subscriptions_tenant_unique do update set
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
    update public.tenants t
    set billing_status = 'active',
        plan = coalesce(_plan_slug, t.plan),
        billing_period_end = subscription_row.current_period_end,
        updated_at = clock_timestamp()
    where t.id = _tenant_id;

    select pp.transaction_fee_percent into platform_fee
    from public.platform_plans pp
    where pp.plan_id = _plan_id;

    if platform_fee is not null then
      insert into public.revenue_splits (
        tenant_id, platform_percentage, school_percentage, updated_at
      ) values (
        _tenant_id, platform_fee, 100 - platform_fee, clock_timestamp()
      )
      on conflict on constraint revenue_splits_tenant_unique do update set
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

create or replace function public.confirm_platform_payment_request(
  _request_id uuid,
  _confirmed_by uuid
)
returns table (
  applied boolean,
  tenant_id uuid,
  switch_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.platform_payment_requests%rowtype;
  subscription_row public.platform_subscriptions%rowtype;
  plan_slug text;
  platform_fee numeric;
  start_at timestamptz;
  end_at timestamptz;
  promoted boolean;
  confirmed_at_value timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.super_admins sa
    where sa.user_id = _confirmed_by
  ) then
    raise exception 'Only super admins can confirm payments'
      using errcode = '42501';
  end if;

  select ppr.* into request_row
  from public.platform_payment_requests ppr
  where ppr.request_id = _request_id
  for update;

  if not found then
    raise exception 'Payment request not found'
      using errcode = 'P0002';
  end if;

  -- The request row lock makes a concurrent winner visible before this replay
  -- branch runs. A completed request is always a no-op: never restamp the actor
  -- and never derive another paid period.
  if request_row.status = 'confirmed' then
    select ps.* into subscription_row
    from public.platform_subscriptions ps
    where ps.tenant_id = request_row.tenant_id;

    return query select
      false,
      request_row.tenant_id,
      request_row.switch_id,
      request_row.confirmed_period_start,
      request_row.confirmed_period_end,
      request_row.confirmed_by,
      request_row.confirmed_at;
    return;
  end if;

  if request_row.status = 'rejected' then
    raise exception 'Rejected payments cannot be confirmed'
      using errcode = 'P0001';
  end if;
  if request_row.status = 'expired' then
    raise exception 'Expired payments cannot be confirmed'
      using errcode = 'P0001';
  end if;
  if request_row.status not in ('pending', 'instructions_sent', 'payment_received') then
    raise exception 'Payment request status % cannot be confirmed', request_row.status
      using errcode = 'P0001';
  end if;
  if request_row.expires_at is not null and request_row.expires_at <= confirmed_at_value then
    raise exception 'Expired payments cannot be confirmed'
      using errcode = 'P0001';
  end if;

  select pp.slug, pp.transaction_fee_percent
  into plan_slug, platform_fee
  from public.platform_plans pp
  where pp.plan_id = request_row.plan_id;

  if not found or plan_slug is null or platform_fee is null then
    raise exception 'Payment request plan is invalid'
      using errcode = 'P0002';
  end if;

  -- This key is shared with apply_self_managed_platform_period. It serializes
  -- different requests for one tenant even when no subscription row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(request_row.tenant_id::text, 625));

  select ps.* into subscription_row
  from public.platform_subscriptions ps
  where ps.tenant_id = request_row.tenant_id
  for update;

  select p.period_start, p.period_end
  into start_at, end_at
  from public.calculate_platform_billing_period(
    subscription_row.current_period_end,
    request_row.interval,
    request_row.request_type = 'renewal',
    confirmed_at_value
  ) p;

  if request_row.switch_id is not null then
    select public.promote_platform_subscription_switch(
      request_row.switch_id,
      request_row.tenant_id,
      coalesce(request_row.payment_provider, 'manual'),
      null,
      null,
      request_row.plan_id,
      'active',
      request_row.interval,
      start_at,
      end_at
    ) into promoted;

    if not coalesce(promoted, false) then
      raise exception 'Subscription switch no longer matches the payment request'
        using errcode = 'P0001';
    end if;

    select ps.* into subscription_row
    from public.platform_subscriptions ps
    where ps.tenant_id = request_row.tenant_id;
  else
    insert into public.platform_subscriptions (
      tenant_id,
      plan_id,
      status,
      payment_provider,
      interval,
      current_period_start,
      current_period_end,
      grace_period_end,
      renewal_reminder_sent_at,
      cancel_at_period_end,
      canceled_at,
      plan_override_by,
      plan_override_at,
      updated_at
    ) values (
      request_row.tenant_id,
      request_row.plan_id,
      'active',
      coalesce(request_row.payment_provider, 'manual'),
      request_row.interval,
      start_at,
      end_at,
      null,
      null,
      false,
      null,
      null,
      null,
      confirmed_at_value
    )
    on conflict on constraint platform_subscriptions_tenant_unique do update set
      plan_id = excluded.plan_id,
      status = excluded.status,
      payment_provider = excluded.payment_provider,
      interval = excluded.interval,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_period_end = null,
      renewal_reminder_sent_at = null,
      cancel_at_period_end = false,
      canceled_at = null,
      plan_override_by = null,
      plan_override_at = null,
      updated_at = excluded.updated_at
    returning * into subscription_row;

    update public.tenants t
    set plan = plan_slug,
        billing_status = 'active',
        billing_period_end = end_at,
        updated_at = confirmed_at_value
    where t.id = request_row.tenant_id;

    if not found then
      raise exception 'Payment request tenant not found'
        using errcode = 'P0002';
    end if;

    insert into public.revenue_splits (
      tenant_id,
      platform_percentage,
      school_percentage,
      updated_at
    ) values (
      request_row.tenant_id,
      platform_fee,
      100 - platform_fee,
      confirmed_at_value
    )
    on conflict on constraint revenue_splits_tenant_unique do update set
      platform_percentage = excluded.platform_percentage,
      school_percentage = excluded.school_percentage,
      updated_at = excluded.updated_at;
  end if;

  update public.platform_payment_requests ppr
  set status = 'confirmed',
      confirmed_by = _confirmed_by,
      confirmed_at = confirmed_at_value,
      confirmed_period_start = subscription_row.current_period_start,
      confirmed_period_end = subscription_row.current_period_end,
      updated_at = confirmed_at_value
  where ppr.request_id = request_row.request_id;

  return query select
    true,
    request_row.tenant_id,
    request_row.switch_id,
    subscription_row.current_period_start,
    subscription_row.current_period_end,
    _confirmed_by,
    confirmed_at_value;
end;
$$;

revoke all on function public.calculate_platform_billing_period(timestamptz, text, boolean, timestamptz)
  from public, anon, authenticated;
revoke all on function public.confirm_platform_payment_request(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_self_managed_platform_period(text, text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.calculate_platform_billing_period(timestamptz, text, boolean, timestamptz)
  to service_role;
grant execute on function public.confirm_platform_payment_request(uuid, uuid)
  to service_role;
grant execute on function public.apply_self_managed_platform_period(text, text, uuid, uuid, text, text, text, text)
  to service_role;
