-- Rollback for 20261021100000_platform_metrics_billing_mode.sql: restores the previous function bodies.

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
  v_total_students     int;
  v_ref_codes          int := 0;
  v_ref_redemptions    int := 0;
begin
  select count(*) into v_total_tenants
  from tenants where status = 'active';

  select count(*) into v_new_tenants_30d
  from tenants where created_at >= now() - interval '30 days';

  select coalesce(jsonb_object_agg(plan, cnt), '{}'::jsonb) into v_by_plan
  from (
    select coalesce(plan, 'free') as plan, count(*) as cnt
    from tenants
    where status = 'active'
    group by coalesce(plan, 'free')
  ) p;

  select count(*) into v_pending_payments
  from platform_payment_requests where status = 'pending';

  -- MRR: normalize each active subscription to a monthly dollar figure.
  select coalesce(sum(
    case
      when ps.interval = 'yearly' then pp.price_yearly / 12.0
      else pp.price_monthly
    end
  ), 0)::numeric into v_mrr
  from platform_subscriptions ps
  join platform_plans pp on pp.plan_id = ps.plan_id
  where ps.status = 'active';

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
    'total_students', coalesce(v_total_students, 0),
    'total_referral_codes', v_ref_codes,
    'total_referral_redemptions', v_ref_redemptions
  );
end;
$$;


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
  -- Mirror of ProviderCapabilities.bearsPlatformFee (lib/payments/types.ts).
  v_fee_bearing text[] := array['stripe', 'paypal', 'lemonsqueezy', 'binance', 'solana', 'solana_subs'];
begin
  -- SaaS MRR (schools paying the platform), normalized to monthly dollars.
  select coalesce(sum(
    case when ps.interval = 'yearly' then pp.price_yearly / 12.0
         else pp.price_monthly end
  ), 0)::numeric
  into v_mrr
  from platform_subscriptions ps
  join platform_plans pp on pp.plan_id = ps.plan_id
  where ps.status = 'active';

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
          'gmv',   round(sum(tf.amount), 2),
          'fees',  round(sum(tf.platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee tf
        left join tenants tn on tn.id = tf.tenant_id
        group by tf.tenant_id, tn.name, tn.plan
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

