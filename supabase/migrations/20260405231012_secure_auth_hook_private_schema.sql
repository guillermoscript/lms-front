-- =============================================================================
-- Move custom_access_token_hook to a private schema
--
-- Per Supabase security best practices, SECURITY DEFINER functions must NOT
-- live in an exposed schema (public). The function runs as postgres and can
-- read tenant_users, super_admins, etc. — any authenticated user could call
-- it via the Data API if it stays in public.
--
-- Fix: Create app_private schema, recreate the function there, update grants,
-- and drop the public version.
-- =============================================================================

-- 1. Create private schema (not exposed via Data API)
CREATE SCHEMA IF NOT EXISTS app_private;

-- 2. Recreate the hook in the private schema
CREATE OR REPLACE FUNCTION app_private.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  claims jsonb;
  user_role public.app_role;
  v_tenant_id uuid;
  v_tenant_role text;
  v_is_super_admin boolean;
BEGIN
  claims := event->'claims';

  -- Fetch user role
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', to_jsonb('student'::text));
  END IF;

  -- Check if super admin
  SELECT EXISTS(
    SELECT 1 FROM public.super_admins WHERE user_id = (event->>'user_id')::uuid
  ) INTO v_is_super_admin;
  claims := jsonb_set(claims, '{is_super_admin}', to_jsonb(v_is_super_admin));

  -- Get tenant context from raw_app_meta_data if available
  v_tenant_id := (event->'claims'->'app_metadata'->>'tenant_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));

    -- Get tenant role
    SELECT tu.role INTO v_tenant_role
    FROM public.tenant_users tu
    WHERE tu.user_id = (event->>'user_id')::uuid
      AND tu.tenant_id = v_tenant_id
      AND tu.status = 'active'
    LIMIT 1;

    IF v_tenant_role IS NOT NULL THEN
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb(v_tenant_role));
    ELSE
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb('student'::text));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$function$;

-- 3. Only supabase_auth_admin needs to call this hook
REVOKE ALL ON FUNCTION app_private.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.custom_access_token_hook(jsonb) FROM anon;
REVOKE ALL ON FUNCTION app_private.custom_access_token_hook(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION app_private.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA app_private TO supabase_auth_admin;

-- 4. Drop the old public version (no longer needed)
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
