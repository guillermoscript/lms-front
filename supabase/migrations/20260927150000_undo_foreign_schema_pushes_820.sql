-- #820 — undo the schema a third party pushed to the production project.
--
-- Between 2026-09-04 and 2026-09-18 someone ran `supabase db push` against
-- production with the database password that commit 140adca0 had leaked into
-- this public repo (rotated 2026-09-27). Sixteen migrations from a codebase
-- that is not this one landed on cloud; none exists in any branch here. What
-- they left behind, and what this migration does about each:
--
--   create_academy() + a 6-arg create_school()  → dropped; the repo's
--     2-arg create_school() is restored. The app calls create_school(_name,
--     _slug), which on cloud resolved to their overload: every school created
--     since came out with country 'MA' and currency 'MAD'.
--   get_tenant_id()                              → restored to
--     20260612170000_harden_get_tenant_id.
--   tenants.primary_color / secondary_color      → dropped (again — #779
--     dropped them; the theme kit is the only branding path).
--   tenants.country (DEFAULT 'MA')               → kept, owned by this repo
--     from now on, but nullable with NO default and cleared: every row said
--     Morocco, which is false. A real country picker is its own issue.
--   tenant_settings country / colour rows, MAD   → deleted (duplicates of the
--     columns above; MAD was never chosen by anyone).
--   platform_plans in dirhams, enterprise gone   → the five plans are put back
--     to the values the repo's migrations define.
--   the sixteen ledger rows                      → deleted, so the cloud ledger
--     lists only migrations that exist here.
--
-- Deliberately NOT touched: tenants.plan and the manual platform_subscriptions
-- that "upgrade all tenants" created. The owner is deleting those tenants.
--
-- Every statement is idempotent: on a fresh `db reset` there is nothing
-- foreign to remove and the net effect is only the nullable country column.

-- ─── 1. Tenant creation ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_academy(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_school(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_school(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _tenant_id UUID;
  _user_id UUID;
BEGIN
  _user_id := auth.uid();

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create the tenant
  INSERT INTO public.tenants (name, slug, status)
  VALUES (_name, _slug, 'active')
  RETURNING id INTO _tenant_id;

  -- Add creator as admin of the new tenant
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (_tenant_id, _user_id, 'admin', 'active');

  -- Set app_metadata.tenant_id so the JWT hook injects correct claims
  -- on the next token refresh (before the proxy even runs).
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('tenant_id', _tenant_id::text)
  WHERE id = _user_id;

  RETURN _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_school(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_school(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_school(text, text) TO authenticated;

-- ─── 2. get_tenant_id() — verbatim from 20260612170000 ──────────────────────

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    -- 1. JWT claim (authenticated users with tenant context)
    WHEN (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id') IS NOT NULL
      THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
    -- 2. Anon on a tenant subdomain: header from proxy.ts, else default tenant
    WHEN auth.uid() IS NULL
      THEN COALESCE(
        (current_setting('request.headers', true)::json ->> 'x-tenant-id')::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid
      )
    -- 3. Authenticated but claim-less: fail closed (match nothing)
    ELSE NULL
  END;
$$;

-- ─── 3. tenants columns ──────────────────────────────────────────────────────

ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS primary_color,
  DROP COLUMN IF EXISTS secondary_color;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS country varchar(2);
ALTER TABLE public.tenants ALTER COLUMN country DROP DEFAULT;
UPDATE public.tenants SET country = NULL WHERE country IS NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN country TYPE varchar(2);
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_country_iso2;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_country_iso2 CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.tenants.country IS
  'ISO 3166-1 alpha-2 country of the school. NULL = not chosen yet.';

-- ─── 4. tenant_settings rows create_academy() wrote ─────────────────────────

DELETE FROM public.tenant_settings
 WHERE setting_key IN ('country', 'primary_color', 'secondary_color');

DELETE FROM public.tenant_settings
 WHERE setting_key = 'currency'
   AND setting_value ->> 'value' = 'MAD';

-- ─── 5. platform_plans — the values this repo's migrations define ───────────
-- 20260217040000 (rows) + 20260714232459 (checkpoint limits)
-- + 20260901170000 (feature keys) + 20260920180000 (AI message limits).

INSERT INTO public.platform_plans
  (slug, name, description, price_monthly, price_yearly, transaction_fee_percent,
   sort_order, is_active, features, limits)
VALUES
(
  'free', 'Free', 'Get started with basic features',
  0, 0, 10.00, 0, true,
  '{"leaderboard": false, "achievements": false, "store": false, "certificates": "basic", "analytics": false, "ai_grading": false, "custom_branding": false, "custom_domain": false, "api_access": true, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true, "community": false, "remove_branding": false, "voice_exercises": false, "landing_pages": true}'::jsonb,
  '{"max_courses": 5, "max_students": 50, "checkpoint_ai_evals_per_month": 0, "checkpoint_ai_evals_per_student_month": 0, "max_ai_messages_per_day": 20, "max_ai_messages_per_month": 300}'::jsonb
),
(
  'starter', 'Starter', 'For growing schools that need more capacity',
  9, 90, 5.00, 1, true,
  '{"leaderboard": true, "achievements": true, "store": false, "certificates": "custom", "analytics": "basic", "ai_grading": false, "custom_branding": false, "custom_domain": false, "api_access": true, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true, "community": true, "remove_branding": false, "voice_exercises": false, "landing_pages": true}'::jsonb,
  '{"max_courses": 15, "max_students": 200, "checkpoint_ai_evals_per_month": 0, "checkpoint_ai_evals_per_student_month": 0, "max_ai_messages_per_day": 40, "max_ai_messages_per_month": 2000}'::jsonb
),
(
  'pro', 'Pro', 'Advanced features for professional educators',
  29, 290, 2.00, 2, true,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": false, "custom_domain": false, "api_access": true, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true, "community": true, "remove_branding": true, "voice_exercises": true, "landing_pages": true}'::jsonb,
  '{"max_courses": 100, "max_students": 1000, "checkpoint_ai_evals_per_month": 500, "checkpoint_ai_evals_per_student_month": 50, "max_ai_messages_per_day": 80, "max_ai_messages_per_month": 10000}'::jsonb
),
(
  'business', 'Business', 'Full platform with custom branding and priority support',
  79, 790, 0, 3, true,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": true, "custom_domain": true, "api_access": true, "white_label": false, "priority_support": true, "xp": true, "levels": true, "streaks": true, "community": true, "remove_branding": true, "voice_exercises": true, "landing_pages": true}'::jsonb,
  '{"max_courses": -1, "max_students": 5000, "checkpoint_ai_evals_per_month": 2000, "checkpoint_ai_evals_per_student_month": 100, "max_ai_messages_per_day": 150, "max_ai_messages_per_month": 50000}'::jsonb
),
(
  'enterprise', 'Enterprise', 'Unlimited everything with white-label and API access',
  199, 1990, 0, 4, true,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": true, "custom_domain": true, "api_access": true, "white_label": true, "priority_support": true, "xp": true, "levels": true, "streaks": true, "community": true, "remove_branding": true, "voice_exercises": true, "landing_pages": true}'::jsonb,
  '{"max_courses": -1, "max_students": -1, "checkpoint_ai_evals_per_month": 10000, "checkpoint_ai_evals_per_student_month": 250, "max_ai_messages_per_day": -1, "max_ai_messages_per_month": -1}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  description             = EXCLUDED.description,
  price_monthly           = EXCLUDED.price_monthly,
  price_yearly            = EXCLUDED.price_yearly,
  transaction_fee_percent = EXCLUDED.transaction_fee_percent,
  sort_order              = EXCLUDED.sort_order,
  is_active               = EXCLUDED.is_active,
  features                = EXCLUDED.features,
  limits                  = EXCLUDED.limits;

-- ─── 6. The foreign ledger rows ──────────────────────────────────────────────

DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN (
   '20260904000000', '20260904010000', '20260905090000', '20260906000000',
   '20260906010000', '20260906120000', '20260909120000', '20260909130000',
   '20260909140000', '20260910170000', '20260911130000', '20260912190800',
   '20260912200000', '20260917000000', '20260917001000', '20260918000000'
 )
   AND name LIKE '%.sql';
