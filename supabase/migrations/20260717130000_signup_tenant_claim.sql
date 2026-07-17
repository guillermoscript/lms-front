-- handle_new_user() runs as an AFTER INSERT trigger, so assigning to
-- NEW.raw_app_meta_data was a silent no-op: fresh signups got no
-- app_metadata.tenant_id, custom_access_token_hook() issued a claim-less JWT,
-- and get_tenant_id() failed closed — a brand-new account couldn't see any
-- tenant-scoped content (e.g. the course it was signing up to enroll in).
-- Persist the tenant with an explicit UPDATE instead, accepting either
-- metadata key the clients send.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'full_name');

  -- Insert default role 'student'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  v_tenant_id := COALESCE(
    (NEW.raw_user_meta_data->>'preferred_tenant_id')::uuid,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid
  );
  IF v_tenant_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('tenant_id', v_tenant_id::text)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;
