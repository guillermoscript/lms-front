-- Fix handle_new_user() to propagate preferred_tenant_id into app_metadata.
-- This ensures the custom_access_token_hook() can read tenant_id from
-- app_metadata on the very first JWT issued after signup, so RLS
-- get_tenant_id() returns the correct tenant instead of falling back
-- to the default tenant.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'full_name');

  -- Insert default role 'student'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  -- Propagate preferred_tenant_id into app_metadata so the JWT hook
  -- can inject it into the access token immediately (no middleware sync needed).
  v_tenant_id := (NEW.raw_user_meta_data->>'preferred_tenant_id')::uuid;
  IF v_tenant_id IS NOT NULL THEN
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('tenant_id', v_tenant_id::text);
  END IF;

  RETURN NEW;
END;
$$;
