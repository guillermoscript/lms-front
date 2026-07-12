-- Platform super-admin REVENUE/FEES analytics across all tenants.
--
-- The `/platform` overview shows tenant/student counts + SaaS MRR, but the super
-- admin had no view of the money the *platform itself* earns from student
-- purchases: the platform fee (the % cut configured per tenant in
-- `revenue_splits`) and the gross volume (GMV) it is taken from. This RPC
-- aggregates that cross-tenant so the new `/platform/revenue` page can render
-- it.
--
-- Fee model (mirrors app/actions/admin/revenue.ts so the numbers reconcile):
--   * GMV          = sum of successful student `transactions.amount` (all providers)
--   * platform fee = for each tx, amount * tenant.platform_percentage / 100,
--                    but ONLY when the tx's provider is in the tenant's
--                    `applies_to_providers` (Stripe Connect collects the fee via
--                    application_fee_amount; manual/offline settle straight to the
--                    school, so no platform fee is taken — counting them would
--                    overstate platform earnings). There is no stored per-tx fee
--                    column, so it is computed, exactly as the school revenue view
--                    does.
--   * SaaS MRR     = recurring revenue from schools paying the platform
--                    (platform_subscriptions), normalized to a monthly figure.
--
-- Amounts are NUMERIC(10,2) dollars.cents and are returned as DOLLARS (the page
-- formats with Intl.NumberFormat 'currency'), consistent with get_platform_stats.
--
-- LOCAL-ONLY: like the other 2026-06-15 payment migrations on this branch, this
-- is not pushed to cloud until the operator says so.

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
      t.amount,
      t.transaction_date,
      coalesce(
        t.payment_provider,
        case when t.stripe_payment_intent_id is not null then 'stripe' else 'manual' end
      ) as provider,
      coalesce(rs.platform_percentage, 20) as platform_percentage,
      coalesce(rs.applies_to_providers, array['stripe']) as applies_to_providers
    from transactions t
    left join revenue_splits rs on rs.tenant_id = t.tenant_id
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
      case when provider = any(applies_to_providers)
           then amount * platform_percentage / 100.0
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

comment on function public.get_platform_revenue(timestamptz, timestamptz) is
  'Platform super-admin revenue/fees aggregated across all tenants: GMV, computed platform fees (per-tenant split on fee-bearing providers), SaaS MRR, and by-provider/by-tenant/monthly breakdowns. Called by /platform/revenue.';

revoke all on function public.get_platform_revenue(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_platform_revenue(timestamptz, timestamptz) to service_role;
