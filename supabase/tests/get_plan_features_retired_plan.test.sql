-- #898: get_plan_features resolves a retired / hidden plan (is_active = false)
-- to that plan, like getTenantPlan() and tenant_plan_limit() do, instead of
-- falling back to free. Run with `supabase test db` against a seeded local
-- stack. Everything rolls back.
BEGIN;
SELECT plan(5);

INSERT INTO public.platform_plans (slug, name, features, limits, transaction_fee_percent, is_active)
VALUES ('pgtap-retired', 'Retired Pro',
        '{"custom_branding": true}'::jsonb,
        '{"max_courses": 100, "max_students": 1000}'::jsonb,
        2, false);

UPDATE public.tenants SET plan = 'pgtap-retired'
WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT is(
  public.get_plan_features('00000000-0000-0000-0000-000000000001') ->> 'plan',
  'pgtap-retired',
  'a tenant on an inactive plan gets that plan, not free'
);
SELECT is(
  (public.get_plan_features('00000000-0000-0000-0000-000000000001') -> 'features' ->> 'custom_branding')::boolean,
  true,
  'the inactive plan''s features apply'
);
SELECT is(
  (public.get_plan_features('00000000-0000-0000-0000-000000000001') -> 'limits' ->> 'max_courses')::int,
  public.tenant_plan_limit('00000000-0000-0000-0000-000000000001', 'max_courses'),
  'features RPC and limit resolver agree on the plan'
);
SELECT is(
  (public.get_plan_features('00000000-0000-0000-0000-000000000001') ->> 'transaction_fee_percent')::numeric,
  2::numeric,
  'the inactive plan''s fee applies'
);

-- A slug with no row at all still falls back to free.
UPDATE public.tenants SET plan = 'pgtap-no-such-plan'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is(
  public.get_plan_features('00000000-0000-0000-0000-000000000001') ->> 'plan',
  'free',
  'an unknown slug falls back to the free plan'
);

SELECT * FROM finish();
ROLLBACK;
