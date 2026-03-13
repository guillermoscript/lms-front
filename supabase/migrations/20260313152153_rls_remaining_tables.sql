-- RLS for remaining tables - Batch 12

-- GRADES
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.grades FROM anon;
REVOKE TRUNCATE ON public.grades FROM authenticated;

CREATE POLICY "Students can view own grades"
  ON public.grades FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers and admins can view all grades"
  ON public.grades FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can manage grades"
  ON public.grades FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- ASSIGNMENTS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.assignments FROM anon;
REVOKE TRUNCATE ON public.assignments FROM authenticated;

CREATE POLICY "Authenticated users can view assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- PLAN_COURSES
ALTER TABLE public.plan_courses ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.plan_courses FROM anon;
REVOKE TRUNCATE ON public.plan_courses FROM authenticated;

CREATE POLICY "Anyone can view plan courses"
  ON public.plan_courses FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage plan courses"
  ON public.plan_courses FOR ALL TO authenticated
  USING (get_tenant_role() = 'admin')
  WITH CHECK (get_tenant_role() = 'admin');

-- ROLES (lookup table)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.roles FROM anon;
REVOKE TRUNCATE ON public.roles FROM authenticated;

CREATE POLICY "Anyone can view roles"
  ON public.roles FOR SELECT TO anon, authenticated
  USING (true);

-- PERMISSIONS (lookup table)
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.permissions FROM anon;
REVOKE TRUNCATE ON public.permissions FROM authenticated;

CREATE POLICY "Anyone can view permissions"
  ON public.permissions FOR SELECT TO anon, authenticated
  USING (true);

-- ROLE_PERMISSIONS (lookup table)
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.role_permissions FROM anon;
REVOKE TRUNCATE ON public.role_permissions FROM authenticated;

CREATE POLICY "Anyone can view role permissions"
  ON public.role_permissions FOR SELECT TO anon, authenticated
  USING (true);

-- LANDING_PAGE_TEMPLATES
ALTER TABLE public.landing_page_templates ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.landing_page_templates FROM anon;
REVOKE TRUNCATE ON public.landing_page_templates FROM authenticated;

CREATE POLICY "Anyone can view landing page templates"
  ON public.landing_page_templates FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Super admins can manage landing page templates"
  ON public.landing_page_templates FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
