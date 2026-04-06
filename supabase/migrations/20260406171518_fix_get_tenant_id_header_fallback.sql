-- =============================================================================
-- Fix get_tenant_id() to read x-tenant-id header as fallback for anon users
--
-- Problem: On non-default tenant subdomains, anon (unauthenticated) users have
-- no tenant_id in their JWT claims. get_tenant_id() falls back to the default
-- tenant UUID, which means RLS blocks all queries for the actual tenant.
--
-- Fix: Read x-tenant-id from the request headers JSON (set by proxy.ts and
-- forwarded by the Supabase server client). PostgREST exposes all request
-- headers via current_setting('request.headers', true) as a JSON object.
--
-- Priority: JWT claims > request header > default tenant
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    -- 1. JWT claims (authenticated users with tenant context)
    (current_setting('request.jwt.claims', true)::jsonb ->>'tenant_id')::uuid,
    -- 2. Request header from proxy.ts (anon users on tenant subdomains)
    (current_setting('request.headers', true)::json ->>'x-tenant-id')::uuid,
    -- 3. Default tenant fallback
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;
