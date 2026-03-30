-- =============================================================================
-- RLS Performance & Security Hardening
--
-- 1. Wrap get_tenant_id(), get_tenant_role(), auth.uid(), is_super_admin()
--    in (select ...) subqueries so they're evaluated ONCE per query, not per row.
--    Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
--
-- 2. Add SET search_path = '' to helper functions to prevent search path hijacking.
--
-- 3. Fix "Anyone can view published courses" to scope to current tenant.
--
-- 4. Fix custom_access_token_hook to set search_path.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART 1: Harden helper functions with search_path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->>'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->>'tenant_role',
    'student'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->>'is_super_admin')::boolean,
    false
  );
$$;


-- ---------------------------------------------------------------------------
-- PART 2: Fix custom_access_token_hook search_path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
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
$$;


-- ---------------------------------------------------------------------------
-- PART 3: Rewrite ALL RLS policies to wrap function calls in (select ...)
--
-- This DO block finds every policy that calls get_tenant_id(), get_tenant_role(),
-- auth.uid(), or is_super_admin() without wrapping in (select ...), then
-- drops and recreates each policy with the wrapped version.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol RECORD;
  new_qual text;
  new_with_check text;
  role_names text[];
  create_sql text;
BEGIN
  FOR pol IN
    SELECT
      schemaname,
      tablename,
      policyname,
      cmd,
      permissive,
      roles,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND (
          qual LIKE '%get_tenant_id()%' AND qual NOT LIKE '%(select get_tenant_id())%'
          OR qual LIKE '%get_tenant_role()%' AND qual NOT LIKE '%(select get_tenant_role())%'
          OR qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%'
          OR qual LIKE '%is_super_admin()%' AND qual NOT LIKE '%(select is_super_admin())%'
        ))
        OR (with_check IS NOT NULL AND (
          with_check LIKE '%get_tenant_id()%' AND with_check NOT LIKE '%(select get_tenant_id())%'
          OR with_check LIKE '%get_tenant_role()%' AND with_check NOT LIKE '%(select get_tenant_role())%'
          OR with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(select auth.uid())%'
          OR with_check LIKE '%is_super_admin()%' AND with_check NOT LIKE '%(select is_super_admin())%'
        ))
      )
  LOOP
    -- Build new USING clause
    new_qual := pol.qual;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'get_tenant_id()', '(select public.get_tenant_id())');
      new_qual := replace(new_qual, 'get_tenant_role()', '(select public.get_tenant_role())');
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'is_super_admin()', '(select public.is_super_admin())');
      -- Avoid double-wrapping
      new_qual := replace(new_qual, '(select (select ', '(select ');
      new_qual := replace(new_qual, '(select (select ', '(select ');
    END IF;

    -- Build new WITH CHECK clause
    new_with_check := pol.with_check;
    IF new_with_check IS NOT NULL THEN
      new_with_check := replace(new_with_check, 'get_tenant_id()', '(select public.get_tenant_id())');
      new_with_check := replace(new_with_check, 'get_tenant_role()', '(select public.get_tenant_role())');
      new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
      new_with_check := replace(new_with_check, 'is_super_admin()', '(select public.is_super_admin())');
      new_with_check := replace(new_with_check, '(select (select ', '(select ');
      new_with_check := replace(new_with_check, '(select (select ', '(select ');
    END IF;

    -- Drop existing policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);

    -- Build role list
    role_names := pol.roles;

    -- Build CREATE POLICY
    create_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      pol.cmd,
      array_to_string(role_names, ', ')
    );

    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || ' USING (' || new_qual || ')';
    END IF;

    IF new_with_check IS NOT NULL THEN
      create_sql := create_sql || ' WITH CHECK (' || new_with_check || ')';
    END IF;

    EXECUTE create_sql;

    RAISE NOTICE 'Rewrote policy: %.% — %', pol.tablename, pol.policyname, pol.cmd;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- PART 4: Fix "Anyone can view published courses" to scope to tenant
-- Without tenant filter, users on Tenant A can see Tenant B's published courses.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view published courses" ON courses;
CREATE POLICY "Anyone can view published courses" ON courses
  AS PERMISSIVE FOR SELECT TO public
  USING (status = 'published' AND tenant_id = (select public.get_tenant_id()));


-- ---------------------------------------------------------------------------
-- PART 5: Fix similar cross-tenant policies on other tables
-- Plans and products visible to students should be tenant-scoped
-- ---------------------------------------------------------------------------

-- Plans: students should only see their tenant's plans
DROP POLICY IF EXISTS "Students can view active plans" ON plans;
CREATE POLICY "Students can view active plans" ON plans
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (select public.get_tenant_id()));

-- Products: students should only see their tenant's products
DROP POLICY IF EXISTS "Students can view active products" ON products;
CREATE POLICY "Students can view active products" ON products
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (status = 'active' AND tenant_id = (select public.get_tenant_id()));

-- Exercises: already has tenant filter, just ensure wrapped
-- Exams: already has tenant filter, just ensure wrapped
-- Lessons: already has tenant filter, just ensure wrapped
