-- Issue #662: make `platform_plans.features` carry every key the app gates on.
--
-- The server-side feature gates (lib/plans/server.ts) treat a missing key as
-- "not included" — the only safe default. But several keys the UI, the pricing
-- table and `lib/plans/features.ts` all talk about were never written to the
-- JSON in production:
--
--   community        — added to the dev seed for #291, never to a migration
--   remove_branding  — 20260222010000 wrote it into `limits`, not `features`,
--                      and production has neither
--   voice_exercises  — only ever existed in the TypeScript interface
--   landing_pages    — same; the free-plan page limit is a separate check
--   api_access       — decision 2026-09-01: the MCP server stays open on every
--                      plan (role-gated only), so the key is TRUE everywhere and
--                      dropped from the pricing promise
--
-- Enforcing before backfilling would lock every plan — Enterprise included —
-- out of those features. This runs first. Idempotent: `||` only adds/overwrites
-- the listed keys and leaves everything else in the object alone.

UPDATE public.platform_plans
   SET features = features || jsonb_build_object(
         'community',       slug <> 'free',
         'remove_branding', slug IN ('pro', 'business', 'enterprise'),
         'voice_exercises', slug IN ('pro', 'business', 'enterprise'),
         'landing_pages',   true,
         'api_access',      true
       ),
       -- the misplaced key from 20260222010000, wherever it landed
       limits = limits - 'remove_branding'
 WHERE slug IN ('free', 'starter', 'pro', 'business', 'enterprise');

-- Any plan row outside the five known slugs (none today) gets the free defaults
-- for the new keys rather than nothing, so a gate on them still has an answer.
UPDATE public.platform_plans
   SET features = jsonb_build_object(
         'community', false, 'remove_branding', false, 'voice_exercises', false,
         'landing_pages', true, 'api_access', true
       ) || features
 WHERE slug NOT IN ('free', 'starter', 'pro', 'business', 'enterprise');
