-- RLS for exams and exam_submissions - Batch 4

-- EXAMS
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exams FROM anon;
REVOKE TRUNCATE ON public.exams FROM authenticated;

CREATE POLICY "Students can view tenant exams"
  ON public.exams FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can create exams"
  ON public.exams FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can update tenant exams"
  ON public.exams FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Admins can delete tenant exams"
  ON public.exams FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() = 'admin');

CREATE POLICY "Super admins can view all exams"
  ON public.exams FOR SELECT TO authenticated
  USING (is_super_admin());

-- EXAM_SUBMISSIONS
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exam_submissions FROM anon;
REVOKE TRUNCATE ON public.exam_submissions FROM authenticated;

CREATE POLICY "Students can view own exam submissions"
  ON public.exam_submissions FOR SELECT TO authenticated
  USING (auth.uid() = student_id AND tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can view tenant exam submissions"
  ON public.exam_submissions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Super admins can view all exam submissions"
  ON public.exam_submissions FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Students can create own exam submissions"
  ON public.exam_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND tenant_id = get_tenant_id());

CREATE POLICY "Teachers and admins can update tenant exam submissions"
  ON public.exam_submissions FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (tenant_id = get_tenant_id() AND get_tenant_role() IN ('teacher', 'admin'));
