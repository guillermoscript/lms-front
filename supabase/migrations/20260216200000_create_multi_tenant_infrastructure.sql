-- Create multi-tenant infrastructure tables
-- These tables are required by the entire application and must exist
-- before revenue_splits, payouts, invoices, etc.

-- =====================================================
-- 1. TENANTS TABLE
-- Core table for school/organization records
-- =====================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#2563eb',
  secondary_color VARCHAR(7) DEFAULT '#7c3aed',
  plan VARCHAR(50) DEFAULT 'free',
  status VARCHAR(50) DEFAULT 'active',
  stripe_account_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

COMMENT ON TABLE tenants IS 'School/organization records for multi-tenant SaaS';

-- =====================================================
-- 2. TENANT_USERS TABLE
-- Many-to-many user-tenant relationships with roles
-- =====================================================

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'student',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tenant_users_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(role);

COMMENT ON TABLE tenant_users IS 'Many-to-many user-tenant relationships with per-tenant roles';

-- =====================================================
-- 3. TENANT_SETTINGS TABLE
-- Per-tenant configuration (key-value store)
-- =====================================================

CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key VARCHAR(255) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tenant_settings_unique UNIQUE (tenant_id, setting_key)
);

CREATE INDEX idx_tenant_settings_tenant ON tenant_settings(tenant_id);
CREATE INDEX idx_tenant_settings_key ON tenant_settings(setting_key);

COMMENT ON TABLE tenant_settings IS 'Per-tenant configuration stored as key-value pairs';

-- =====================================================
-- 4. SUPER_ADMINS TABLE
-- Platform-level super admin users
-- =====================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE super_admins IS 'Platform-level super admin users who can manage all tenants';

-- =====================================================
-- 5. HELPER FUNCTIONS FOR RLS POLICIES
-- Used in RLS policies across many tables
-- Placed in public schema (auth schema is restricted in local Supabase)
-- =====================================================

-- Get tenant_id from JWT claims
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

COMMENT ON FUNCTION public.get_tenant_id IS 'Returns the current tenant_id from JWT claims';

-- Get tenant_role from JWT claims
CREATE OR REPLACE FUNCTION public.get_tenant_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_role',
    'student'
  );
$$;

COMMENT ON FUNCTION public.get_tenant_role IS 'Returns the current tenant_role from JWT claims';

-- Check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin')::boolean,
    false
  );
$$;

COMMENT ON FUNCTION public.is_super_admin IS 'Returns whether the current user is a platform super admin';

-- =====================================================
-- 6. CREATE_SCHOOL RPC
-- Atomically creates a tenant + adds the creator as admin
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_school(
  _name TEXT,
  _slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  INSERT INTO tenants (name, slug, status)
  VALUES (_name, _slug, 'active')
  RETURNING id INTO _tenant_id;

  -- Add creator as admin of the new tenant
  INSERT INTO tenant_users (tenant_id, user_id, role, status)
  VALUES (_tenant_id, _user_id, 'admin', 'active');

  RETURN _tenant_id;
END;
$$;

COMMENT ON FUNCTION public.create_school IS 'Creates a new school/tenant and adds the creator as admin';

-- =====================================================
-- 7. UPDATE JWT HOOK TO INCLUDE TENANT CLAIMS
-- =====================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_role public.app_role;
  v_tenant_id uuid;
  v_tenant_role text;
  v_is_super_admin boolean;
BEGIN
  claims := event->'claims';

  -- Get the user_id from the event
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
    SELECT 1 FROM super_admins WHERE user_id = (event->>'user_id')::uuid
  ) INTO v_is_super_admin;
  claims := jsonb_set(claims, '{is_super_admin}', to_jsonb(v_is_super_admin));

  -- Get tenant context from raw_app_meta_data if available
  v_tenant_id := (event->'claims'->'app_metadata'->>'tenant_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));

    -- Get tenant role
    SELECT tu.role INTO v_tenant_role
    FROM tenant_users tu
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
$$;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;

-- =====================================================
-- 8. RLS POLICIES
-- =====================================================

-- Tenants RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tenants" ON tenants
  FOR SELECT
  USING (status = 'active');

CREATE POLICY "Super admins can manage tenants" ON tenants
  FOR ALL
  USING (public.is_super_admin());

CREATE POLICY "Tenant admins can update own tenant" ON tenants
  FOR UPDATE
  USING (id = public.get_tenant_id() AND public.get_tenant_role() = 'admin');

-- Tenant Users RLS
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memberships" ON tenant_users
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Tenant admins can view tenant members" ON tenant_users
  FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_tenant_role() = 'admin');

CREATE POLICY "Tenant admins can manage members" ON tenant_users
  FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_tenant_role() = 'admin');

CREATE POLICY "Super admins can manage all members" ON tenant_users
  FOR ALL
  USING (public.is_super_admin());

-- Tenant Settings RLS
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view own settings" ON tenant_settings
  FOR SELECT
  USING (
    tenant_id = public.get_tenant_id() OR public.is_super_admin()
  );

CREATE POLICY "Tenant admins can manage own settings" ON tenant_settings
  FOR ALL
  USING (
    (tenant_id = public.get_tenant_id() AND public.get_tenant_role() = 'admin') OR
    public.is_super_admin()
  );

-- Super Admins RLS
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view super_admins" ON super_admins
  FOR SELECT
  USING (public.is_super_admin());

-- =====================================================
-- 9. UPDATED_AT TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. SEED DEFAULT TENANT
-- =====================================================

INSERT INTO tenants (id, slug, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default School', 'active')
ON CONFLICT (id) DO NOTHING;
