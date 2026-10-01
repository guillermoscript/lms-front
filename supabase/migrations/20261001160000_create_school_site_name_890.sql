-- #890 — create_school() seeds the `site_name` tenant setting (= the school's
-- name), and existing tenants that lack one are backfilled.
--
-- The admin General settings form requires site_name, so a school made through
-- create_school() could not save it until the admin typed a name. The contact /
-- support emails are NOT seeded (they are public-facing and the creator's
-- login email is private); the form treats them as optional instead.

DROP FUNCTION IF EXISTS public.create_school(text, text);

CREATE OR REPLACE FUNCTION public.create_school(
  _name text,
  _slug text,
  _country text DEFAULT NULL,
  _currency text DEFAULT NULL
)
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

  _country  := NULLIF(upper(btrim(_country)), '');
  _currency := NULLIF(upper(btrim(_currency)), '');

  IF _country IS NOT NULL AND _country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid_country' USING ERRCODE = '22023';
  END IF;

  IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = '22023';
  END IF;

  -- Create the tenant
  INSERT INTO public.tenants (name, slug, status, country)
  VALUES (_name, _slug, 'active', _country)
  RETURNING id INTO _tenant_id;

  -- Add creator as admin of the new tenant
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (_tenant_id, _user_id, 'admin', 'active');

  -- Default currency, only where none is set (a brand-new tenant has none,
  -- but never overwrite).
  IF _currency IS NOT NULL THEN
    INSERT INTO public.tenant_settings (tenant_id, setting_key, setting_value)
    VALUES (_tenant_id, 'currency', jsonb_build_object('value', _currency))
    ON CONFLICT (tenant_id, setting_key) DO NOTHING;
  END IF;

  -- #890 — the General settings form requires a site name; seed it from the
  -- school's name so a new school can save that form untouched.
  INSERT INTO public.tenant_settings (tenant_id, setting_key, setting_value)
  VALUES (_tenant_id, 'site_name', jsonb_build_object('value', _name))
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  -- Set app_metadata.tenant_id so the JWT hook injects correct claims
  -- on the next token refresh (before the proxy even runs).
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('tenant_id', _tenant_id::text)
  WHERE id = _user_id;

  RETURN _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_school(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_school(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_school(text, text, text, text) TO authenticated;

-- Backfill. tenant_settings has no user triggers today, but disable them for
-- the statement so a future one can't fire per backfilled row; ON CONFLICT
-- keeps any name an admin already set.
ALTER TABLE public.tenant_settings DISABLE TRIGGER USER;

INSERT INTO public.tenant_settings (tenant_id, setting_key, setting_value)
SELECT t.id, 'site_name', jsonb_build_object('value', t.name)
FROM public.tenants t
WHERE NULLIF(btrim(t.name), '') IS NOT NULL
ON CONFLICT (tenant_id, setting_key) DO NOTHING;

ALTER TABLE public.tenant_settings ENABLE TRIGGER USER;
