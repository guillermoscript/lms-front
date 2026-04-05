-- =============================================================================
-- Fix create_school RPC to set app_metadata.tenant_id
--
-- The JWT hook reads tenant_id from app_metadata to inject tenant_role into
-- the JWT. Without this, new school creators get stale JWTs (no tenant_id)
-- and RLS blocks all queries until the proxy syncs it on a subsequent request.
--
-- By setting app_metadata.tenant_id in the RPC itself, the very next token
-- refresh will produce a JWT with the correct tenant_id and tenant_role.
-- =============================================================================

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

-- Only authenticated users can call this
REVOKE ALL ON FUNCTION public.create_school(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_school(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_school(text, text) TO authenticated;
