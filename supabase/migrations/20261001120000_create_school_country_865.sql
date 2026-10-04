-- #865 — a school's country is chosen when the school is created.
--
-- create_school() gains two nullable arguments:
--   _country  → tenants.country (ISO 3166-1 alpha-2; the column and its CHECK
--               come from 20260927150000). NULL = not chosen, never a guess.
--   _currency → the `currency` tenant_setting, written only if the school has
--               none yet. The country → currency map lives in TypeScript
--               (lib/countries.ts); this function only stores what it is given.
--
-- The two-argument overload is dropped rather than kept beside the new one:
-- two overloads that both accept (_name, _slug) make PostgREST's resolution
-- ambiguous. Callers that still send only _name/_slug keep working, because
-- both new arguments default to NULL.

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
