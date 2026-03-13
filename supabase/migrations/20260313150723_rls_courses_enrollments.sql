-- RLS for courses and enrollments - Batch 2

-- COURSES
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.courses FROM anon;
REVOKE TRUNCATE ON public.courses FROM authenticated;
REVOKE INSERT, UPDATE ON public.courses FROM anon;

CREATE POLICY "Anyone can view published courses"
  ON public.courses FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Teachers can view own courses"
  ON public.courses FOR SELECT TO authenticated
  USING (author_id = auth.uid() AND tenant_id = get_tenant_id());

CREATE POLICY "Admins can view all tenant courses"
  ON public.courses FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Super admins can view all courses"
  ON public.courses FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Teachers and admins can create courses"
  ON public.courses FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers can update own courses"
  ON public.courses FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND tenant_id = get_tenant_id())
  WITH CHECK (author_id = auth.uid() AND tenant_id = get_tenant_id());

CREATE POLICY "Admins can update tenant courses"
  ON public.courses FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete tenant courses"
  ON public.courses FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

-- ENROLLMENTS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.enrollments FROM anon;
REVOKE TRUNCATE ON public.enrollments FROM authenticated;

CREATE POLICY "Students can view own enrollments"
  ON public.enrollments FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can view tenant enrollments"
  ON public.enrollments FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Super admins can view all enrollments"
  ON public.enrollments FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can create own enrollments"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Admins can update tenant enrollments"
  ON public.enrollments FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');
