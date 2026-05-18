-- Fix payment_requests RLS policies.
--
-- The original policies checked `user_roles` for admin access, but the
-- platform uses `tenant_users` for role management. A tenant admin who is
-- only in `tenant_users` (not `user_roles`) cannot SELECT or UPDATE payment
-- requests via the regular client. The server actions use createAdminClient()
-- (bypasses RLS) so the dashboard works today, but direct-client access and
-- any future RLS-dependent features would silently fail.
--
-- Replace all four original policies with the standard pattern used by
-- products, plans, and subscriptions: get_tenant_id() + get_tenant_role() +
-- is_super_admin().

-- Drop all existing policies on payment_requests
DROP POLICY IF EXISTS "Students can view own payment requests"    ON public.payment_requests;
DROP POLICY IF EXISTS "Students can create payment requests"      ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can view all payment requests"      ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can update payment requests"        ON public.payment_requests;

-- Students: view and create their own requests within the tenant
CREATE POLICY "Students can view own payment requests"
  ON public.payment_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "Students can create payment requests"
  ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND tenant_id = get_tenant_id()
  );

-- Admins: full read/write on their tenant's requests
CREATE POLICY "Admins can view tenant payment requests"
  ON public.payment_requests FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Admins can update tenant payment requests"
  ON public.payment_requests FOR UPDATE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

-- Super admins: full access across all tenants
CREATE POLICY "Super admins can manage all payment requests"
  ON public.payment_requests FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
