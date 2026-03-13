-- RLS for exercise child tables - Batch 8

-- EXERCISE_CODE_STUDENT_SUBMISSIONS
ALTER TABLE public.exercise_code_student_submissions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exercise_code_student_submissions FROM anon;
REVOKE TRUNCATE ON public.exercise_code_student_submissions FROM authenticated;

CREATE POLICY "Students can manage own code submissions"
  ON public.exercise_code_student_submissions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all code submissions"
  ON public.exercise_code_student_submissions FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

-- EXERCISE_COMPLETIONS
ALTER TABLE public.exercise_completions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exercise_completions FROM anon;
REVOKE TRUNCATE ON public.exercise_completions FROM authenticated;

CREATE POLICY "Students can manage own exercise completions"
  ON public.exercise_completions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all exercise completions"
  ON public.exercise_completions FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

-- EXERCISE_FILES
ALTER TABLE public.exercise_files ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exercise_files FROM anon;
REVOKE TRUNCATE ON public.exercise_files FROM authenticated;

CREATE POLICY "Authenticated users can view exercise files"
  ON public.exercise_files FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage exercise files"
  ON public.exercise_files FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- EXERCISE_MESSAGES
ALTER TABLE public.exercise_messages ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exercise_messages FROM anon;
REVOKE TRUNCATE ON public.exercise_messages FROM authenticated;

CREATE POLICY "Students can manage own exercise messages"
  ON public.exercise_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all exercise messages"
  ON public.exercise_messages FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));
