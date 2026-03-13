-- RLS for exam child tables - Batch 7

-- EXAM_QUESTIONS
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exam_questions FROM anon;
REVOKE TRUNCATE ON public.exam_questions FROM authenticated;

CREATE POLICY "Authenticated users can view exam questions"
  ON public.exam_questions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage exam questions"
  ON public.exam_questions FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- QUESTION_OPTIONS
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.question_options FROM anon;
REVOKE TRUNCATE ON public.question_options FROM authenticated;

CREATE POLICY "Authenticated users can view question options"
  ON public.question_options FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage question options"
  ON public.question_options FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- EXAM_ANSWERS
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exam_answers FROM anon;
REVOKE TRUNCATE ON public.exam_answers FROM authenticated;

CREATE POLICY "Authenticated users can view exam answers"
  ON public.exam_answers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create exam answers"
  ON public.exam_answers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Teachers and admins can update exam answers"
  ON public.exam_answers FOR UPDATE TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

-- EXAM_SCORES
ALTER TABLE public.exam_scores ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exam_scores FROM anon;
REVOKE TRUNCATE ON public.exam_scores FROM authenticated;

CREATE POLICY "Students can view own exam scores"
  ON public.exam_scores FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers and admins can view all exam scores"
  ON public.exam_scores FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can manage exam scores"
  ON public.exam_scores FOR ALL TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'))
  WITH CHECK (get_tenant_role() IN ('teacher', 'admin'));

-- EXAM_VIEWS
ALTER TABLE public.exam_views ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.exam_views FROM anon;
REVOKE TRUNCATE ON public.exam_views FROM authenticated;

CREATE POLICY "Users can view own exam views"
  ON public.exam_views FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own exam views"
  ON public.exam_views FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all exam views"
  ON public.exam_views FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));
