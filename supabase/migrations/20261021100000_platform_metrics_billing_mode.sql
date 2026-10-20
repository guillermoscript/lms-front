-- Platform console metrics become billing_mode-aware.
--
-- billing_mode (#982) added paid | comped | internal, but get_platform_stats and
-- get_platform_revenue still summed every active platform_subscriptions row into MRR.
-- comped/internal schools hold an override subscription row (plan comes free), so MRR was
-- inflated (prod at write time: 1975.00 paid vs 2119.83 shown).
--
--   * MRR (mrr_cents / saas_mrr) = paid schools only.
--   * New: mrr_waived / saas_mrr_waived = list-price value given away to comped/internal.
--   * get_platform_stats: tenants_by_plan = paid schools only; adds paying_tenants and
--     tenants_by_billing_mode.
--   * get_platform_revenue: by_tenant rows carry billing_mode.
-- Signatures and grants unchanged (service_role only). Down: rollback/20261021100000_*.

create or replace function public.get_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_tenants      int;
  v_new_tenants_30d    int;
  v_by_plan            jsonb;
  v_pending_payments   int;
  v_mrr                numeric;
  v_mrr_waived         numeric;
  v_by_mode            jsonb;
  v_paying             int;
  v_total_students     int;
  v_ref_codes          int := 0;
  v_ref_redemptions    int := 0;
begin
  select count(*) into v_total_tenants
  from tenants where status = 'active';

  select count(*) into v_paying
  from tenants where status = 'active' and billing_mode = 'paid';

  select coalesce(jsonb_object_agg(billing_mode, cnt), '{}'::jsonb) into v_by_mode
  from (select billing_mode, count(*) as cnt from tenants where status = 'active' group by billing_mode) m;

  select count(*) into v_new_tenants_30d
  from tenants where created_at >= now() - interval '30 days';

  select coalesce(jsonb_object_agg(plan, cnt), '{}'::jsonb) into v_by_plan
  from (
    select coalesce(plan, 'free') as plan, count(*) as cnt
    from tenants
    where status = 'active' and billing_mode = 'paid'
    group by coalesce(plan, 'free')
  ) p;

  select count(*) into v_pending_payments
  from platform_payment_requests where status = 'pending';

  -- MRR: only schools that actually pay (billing_mode = 'paid'). comped/internal schools
  -- hold an active platform_subscriptions row (the plan override) but pay nothing; their
  -- list-price value is reported separately as mrr_waived.
  select
    coalesce(sum(m) filter (where bm = 'paid'), 0),
    coalesce(sum(m) filter (where bm <> 'paid'), 0)
  into v_mrr, v_mrr_waived
  from (
    select t.billing_mode as bm,
      case when ps.interval = 'yearly' then pp.price_yearly / 12.0
           else pp.price_monthly end as m
    from platform_subscriptions ps
    join platform_plans pp on pp.plan_id = ps.plan_id
    join tenants t on t.id = ps.tenant_id
    where ps.status = 'active'
  ) s;

  select count(distinct user_id) into v_total_students
  from tenant_users where role = 'student';

  if to_regclass('public.referral_codes') is not null then
    execute 'select count(*) from referral_codes' into v_ref_codes;
  end if;
  if to_regclass('public.referral_redemptions') is not null then
    execute 'select count(*) from referral_redemptions' into v_ref_redemptions;
  end if;

  return jsonb_build_object(
    'total_tenants', coalesce(v_total_tenants, 0),
    'new_tenants_30d', coalesce(v_new_tenants_30d, 0),
    'tenants_by_plan', v_by_plan,
    'pending_payment_requests', coalesce(v_pending_payments, 0),
    'mrr_cents', round(coalesce(v_mrr, 0), 2),
    'mrr_waived', round(coalesce(v_mrr_waived, 0), 2),
    'paying_tenants', coalesce(v_paying, 0),
    'tenants_by_billing_mode', v_by_mode,
    'total_students', coalesce(v_total_students, 0),
    'total_referral_codes', v_ref_codes,
    'total_referral_redemptions', v_ref_redemptions
  );
end;
$$;

comment on function public.get_platform_stats() is
  'Platform super-admin overview metrics across all tenants. MRR and plan distribution count paid schools only; comped/internal are reported separately (mrr_waived, tenants_by_billing_mode). Called by /platform.';

revoke all on function public.get_platform_stats() from public, anon, authenticated;
grant execute on function public.get_platform_stats() to service_role;

create or replace function public.get_platform_revenue(
  _start timestamptz default null,
  _end   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_mrr  numeric;
  v_mrr_waived numeric;
  -- Mirror of ProviderCapabilities.bearsPlatformFee (lib/payments/types.ts).
  v_fee_bearing text[] := array['stripe', 'paypal', 'lemonsqueezy', 'binance', 'solana', 'solana_subs'];
begin
  -- SaaS MRR: paid schools only. comped/internal hold an override subscription row but pay
  -- nothing; their list-price value is reported as saas_mrr_waived.
  select
    coalesce(sum(m) filter (where bm = 'paid'), 0),
    coalesce(sum(m) filter (where bm <> 'paid'), 0)
  into v_mrr, v_mrr_waived
  from (
    select t.billing_mode as bm,
      case when ps.interval = 'yearly' then pp.price_yearly / 12.0
           else pp.price_monthly end as m
    from platform_subscriptions ps
    join platform_plans pp on pp.plan_id = ps.plan_id
    join tenants t on t.id = ps.tenant_id
    where ps.status = 'active'
  ) s;

  with tx as (
    select
      t.tenant_id,
      greatest(t.amount - coalesce(t.refunded_amount, 0), 0) as amount,
      t.transaction_date,
      coalesce(
        t.payment_provider,
        case when t.stripe_payment_intent_id is not null then 'stripe' else 'manual' end
      ) as provider,
      -- Platform share = 100 - the school's share, snapshotted per transaction.
      100 - coalesce(t.school_percentage_snapshot, public.effective_school_percentage(t.tenant_id)) as platform_percentage
    from transactions t
    where t.status = 'successful'
      and (_start is null or t.transaction_date >= _start)
      and (_end   is null or t.transaction_date <= _end)
  ),
  tx_fee as (
    select
      tenant_id,
      amount,
      transaction_date,
      provider,
      case when provider = any(v_fee_bearing)
           then round(amount * platform_percentage / 100.0, 2)
           else 0 end as platform_fee
    from tx
  )
  select jsonb_build_object(
    'gmv',               (select coalesce(sum(amount), 0)       from tx_fee),
    'platform_fees',     (select coalesce(sum(platform_fee), 0) from tx_fee),
    'transaction_count', (select count(*)                       from tx_fee),
    'saas_mrr',          round(v_mrr, 2),
    'saas_mrr_waived',   round(coalesce(v_mrr_waived, 0), 2),
    'by_provider', (
      select coalesce(jsonb_agg(row order by row->>'fees' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'provider', provider,
          'gmv',   round(sum(amount), 2),
          'fees',  round(sum(platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee
        group by provider
      ) p
    ),
    'by_tenant', (
      select coalesce(jsonb_agg(row order by (row->>'fees')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'tenant_id', tf.tenant_id,
          'name',      coalesce(tn.name, 'Unknown'),
          'plan',      coalesce(tn.plan, 'free'),
          'billing_mode', coalesce(tn.billing_mode, 'paid'),
          'gmv',   round(sum(tf.amount), 2),
          'fees',  round(sum(tf.platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee tf
        left join tenants tn on tn.id = tf.tenant_id
        group by tf.tenant_id, tn.name, tn.plan, tn.billing_mode
      ) t
    ),
    'monthly', (
      select coalesce(jsonb_agg(row order by row->>'month'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'month', to_char(date_trunc('month', transaction_date), 'YYYY-MM'),
          'gmv',  round(sum(amount), 2),
          'fees', round(sum(platform_fee), 2)
        ) as row
        from tx_fee
        group by date_trunc('month', transaction_date)
        order by date_trunc('month', transaction_date)
      ) m
    )
  )
  into result;

  return result;
end;
$$;

comment on function public.get_platform_revenue(timestamptz, timestamptz) is
  'Platform super-admin revenue/fees across all tenants: GMV net of refunds, computed platform fees, SaaS MRR (paid schools only) plus waived value of comped/internal, and by-provider/by-tenant/monthly breakdowns. Called by /platform/revenue.';

revoke all on function public.get_platform_revenue(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_platform_revenue(timestamptz, timestamptz) to service_role;
