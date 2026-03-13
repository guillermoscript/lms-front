-- RLS for transactions table - Batch 1
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE ON public.transactions FROM anon, authenticated;
REVOKE DELETE ON public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.transactions FROM anon;

CREATE POLICY "Students can view own transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can view tenant transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Super admins can view all transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id())
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());
