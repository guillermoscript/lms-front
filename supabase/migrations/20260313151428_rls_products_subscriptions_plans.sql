-- RLS for products, subscriptions, plans - Batch 3

-- PRODUCTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.products FROM anon;
REVOKE TRUNCATE ON public.products FROM authenticated;

CREATE POLICY "Anyone can view active products"
  ON public.products FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "Admins can view all tenant products"
  ON public.products FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Super admins can view all products"
  ON public.products FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Admins can create products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can update tenant products"
  ON public.products FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete tenant products"
  ON public.products FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

-- PLANS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.plans FROM anon;
REVOKE TRUNCATE ON public.plans FROM authenticated;

CREATE POLICY "Anyone can view plans"
  ON public.plans FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can view all tenant plans"
  ON public.plans FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Super admins can view all plans"
  ON public.plans FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Admins can create plans"
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can update tenant plans"
  ON public.plans FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete tenant plans"
  ON public.plans FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

-- SUBSCRIPTIONS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.subscriptions FROM anon;
REVOKE TRUNCATE ON public.subscriptions FROM authenticated;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can view tenant subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Super admins can view all subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can create own subscriptions"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Admins can update tenant subscriptions"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');
