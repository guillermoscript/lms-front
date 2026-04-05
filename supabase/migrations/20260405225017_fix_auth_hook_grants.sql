-- =============================================================================
-- Fix custom_access_token_hook permissions
--
-- Root cause: The JWT hook queries tenant_users and super_admins but
-- supabase_auth_admin had no SELECT grant on those tables, AND the hook
-- was not SECURITY DEFINER so RLS blocked the queries even with grants.
-- The WHEN OTHERS handler swallowed the permission error, returning the
-- event unchanged — so JWTs never got tenant_id, tenant_role, or
-- user_role claims. This broke all RLS policies.
--
-- Fix: SECURITY DEFINER makes the hook run as postgres (bypasses RLS).
-- Grants are kept as a safety net.
-- =============================================================================

GRANT SELECT ON public.tenant_users TO supabase_auth_admin;
GRANT SELECT ON public.super_admins TO supabase_auth_admin;

-- The hook must be SECURITY DEFINER to bypass RLS on tenant_users/super_admins
ALTER FUNCTION public.custom_access_token_hook(jsonb) SECURITY DEFINER;
