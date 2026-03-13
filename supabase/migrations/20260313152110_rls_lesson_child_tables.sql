-- RLS for lesson child tables - Batch 9

-- LESSON_COMMENTS
ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.lesson_comments FROM anon;
REVOKE TRUNCATE ON public.lesson_comments FROM authenticated;

CREATE POLICY "Authenticated users can view lesson comments"
  ON public.lesson_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create own lesson comments"
  ON public.lesson_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lesson comments"
  ON public.lesson_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lesson comments"
  ON public.lesson_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any lesson comment"
  ON public.lesson_comments FOR DELETE TO authenticated
  USING (get_tenant_role() = 'admin');

-- LESSON_PASSED
ALTER TABLE public.lesson_passed ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.lesson_passed FROM anon;
REVOKE TRUNCATE ON public.lesson_passed FROM authenticated;

CREATE POLICY "Students can manage own lesson passed"
  ON public.lesson_passed FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all lesson passed"
  ON public.lesson_passed FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

-- LESSON_VIEWS
ALTER TABLE public.lesson_views ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.lesson_views FROM anon;
REVOKE TRUNCATE ON public.lesson_views FROM authenticated;

CREATE POLICY "Students can manage own lesson views"
  ON public.lesson_views FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers and admins can view all lesson views"
  ON public.lesson_views FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));
