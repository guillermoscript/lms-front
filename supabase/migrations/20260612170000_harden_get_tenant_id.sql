-- =============================================================================
-- Harden get_tenant_id(): header fallback for anon only; authenticated
-- tokens without a tenant_id claim now fail closed.
--
-- Problem (found in the post-#327 same-class RLS audit): the x-tenant-id
-- header fallback added in 20260406171518 applies to EVERY request whose JWT
-- lacks a tenant_id claim — including *authenticated* ones. The header is
-- client-settable on a direct PostgREST call, so an authenticated user holding
-- a token minted without the custom_access_token_hook claims (legacy token,
-- or any future auth path that skips the hook) could spoof x-tenant-id and
-- read any tenant's rows through every policy of the form
-- `tenant_id = get_tenant_id()` that has no auth.uid()-bound predicate
-- (notifications, tenant_settings, leaderboard_cache, lessons/exercises/exams
-- catalog reads, etc.).
--
-- Fix, by request kind:
--   - JWT has tenant_id claim (all hook-minted tokens)  -> claim, as before.
--   - Anon (auth.uid() IS NULL)                         -> header (set by
--     proxy.ts for subdomain catalog/landing reads — anon-visible data is
--     public by design), else default tenant. Unchanged behavior.
--   - Authenticated WITHOUT claim                       -> NULL: matches no
--     row, so tenant-scoped policies fail closed instead of trusting a
--     client-settable header. A re-login/refresh mints a claimed token.
--
-- get_tenant_role()/is_super_admin() already read only JWT claims, so
-- role-gated policies were never header-spoofable; this closes the
-- tenant-match-only class at its single choke point instead of patching
-- ~20 policies one by one.
-- =============================================================================

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
