-- RLS for exercises and lessons - Batch 5

-- EXERCISES
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exercises FROM anon;
REVOKE TRUNCATE ON public.exercises FROM authenticated;

CREATE POLICY "Users can view tenant exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Super admins can view all exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Teachers and admins can create exercises"
  ON public.exercises FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can update tenant exercises"
  ON public.exercises FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Admins can delete tenant exercises"
  ON public.exercises FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

-- LESSONS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.lessons FROM anon;
REVOKE TRUNCATE ON public.lessons FROM authenticated;

CREATE POLICY "Users can view tenant lessons"
  ON public.lessons FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Super admins can view all lessons"
  ON public.lessons FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Teachers and admins can create lessons"
  ON public.lessons FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can update tenant lessons"
  ON public.lessons FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Admins can delete tenant lessons"
  ON public.lessons FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');
