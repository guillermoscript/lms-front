-- RLS for product_courses and course_categories - Batch 6

-- PRODUCT_COURSES
ALTER TABLE public.product_courses ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.product_courses FROM anon;
REVOKE TRUNCATE ON public.product_courses FROM authenticated;

CREATE POLICY "Anyone can view product courses"
  ON public.product_courses FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can create product courses"
  ON public.product_courses FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can update product courses"
  ON public.product_courses FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete product courses"
  ON public.product_courses FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

-- COURSE_CATEGORIES
ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.course_categories FROM anon;
REVOKE TRUNCATE ON public.course_categories FROM authenticated;

CREATE POLICY "Anyone can view course categories"
  ON public.course_categories FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can create categories"
  ON public.course_categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can update categories"
  ON public.course_categories FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin')
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete categories"
  ON public.course_categories FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');
