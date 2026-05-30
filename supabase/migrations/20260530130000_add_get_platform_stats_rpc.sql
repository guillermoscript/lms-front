-- Platform super-admin overview metrics.
--
-- The `/platform` overview page calls `get_platform_stats()` but the function was
-- never created, so every metric card rendered 0 / "$0.00" and Plan Distribution
-- showed "No active tenants yet" regardless of real data.
--
-- Shape consumed by app/[locale]/platform/page.tsx (PlatformStats interface):
--   { total_tenants, new_tenants_30d, tenants_by_plan, pending_payment_requests,
--     mrr_cents, total_students, total_referral_codes, total_referral_redemptions }
--
-- NOTE: despite the field name `mrr_cents`, the page formats it directly as a
-- currency amount (Intl.NumberFormat 'currency'), i.e. it expects DOLLARS, not
-- cents. We therefore return the normalized monthly dollar figure.
--
-- NOTE: referral_codes / referral_redemptions tables do not exist yet (the
-- referral feature is unbuilt), so those counts are returned as 0 via to_regclass
-- guards. When the referral schema lands, replace the guarded 0s with real counts.

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

comment on function public.get_platform_stats() is
  'Platform super-admin overview metrics aggregated across all tenants. Called by /platform overview page.';

revoke all on function public.get_platform_stats() from public, anon, authenticated;
grant execute on function public.get_platform_stats() to service_role;
