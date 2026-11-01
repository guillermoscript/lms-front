-- Same class as tenant_payment_wallets (20261101120000): policies keyed on
-- tenant_users role without status = 'active' let removed/banned members keep
-- access. ALTER POLICY keeps each policy's roles/command untouched.

-- course_ai_tutors
ALTER POLICY "Teachers can manage their course AI tutors" ON public.course_ai_tutors
  USING (public.is_staff_of(tenant_id));

ALTER POLICY "Students can read enabled AI tutors" ON public.course_ai_tutors
  USING (
    enabled = true
    AND tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid()) AND tu.status = 'active'
    )
  );

-- lesson_resources: admin branch requires an active admin
ALTER POLICY lesson_resources_delete ON public.lesson_resources
  USING (
    tenant_id = (SELECT ((current_setting('request.jwt.claims', true))::jsonb ->> 'tenant_id')::uuid)
    AND (
      EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.course_id = l.course_id
              WHERE l.id = lesson_resources.lesson_id AND c.author_id = (SELECT auth.uid()))
      OR public.is_admin_of(lesson_resources.tenant_id)
    )
  );

ALTER POLICY lesson_resources_insert ON public.lesson_resources
  WITH CHECK (
    tenant_id = (SELECT ((current_setting('request.jwt.claims', true))::jsonb ->> 'tenant_id')::uuid)
    AND (
      EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.course_id = l.course_id
              WHERE l.id = lesson_resources.lesson_id AND c.author_id = (SELECT auth.uid()))
      OR public.is_admin_of(lesson_resources.tenant_id)
    )
  );

ALTER POLICY lesson_resources_update ON public.lesson_resources
  USING (
    tenant_id = (SELECT ((current_setting('request.jwt.claims', true))::jsonb ->> 'tenant_id')::uuid)
    AND (
      EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.course_id = l.course_id
              WHERE l.id = lesson_resources.lesson_id AND c.author_id = (SELECT auth.uid()))
      OR public.is_admin_of(lesson_resources.tenant_id)
    )
  );

ALTER POLICY lesson_resources_select ON public.lesson_resources
  USING (
    tenant_id = (SELECT ((current_setting('request.jwt.claims', true))::jsonb ->> 'tenant_id')::uuid)
    AND (
      EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.course_id = l.course_id
              WHERE l.id = lesson_resources.lesson_id AND c.author_id = (SELECT auth.uid()))
      OR public.is_admin_of(lesson_resources.tenant_id)
      OR EXISTS (SELECT 1 FROM public.lessons l
                 WHERE l.id = lesson_resources.lesson_id
                   AND public.has_course_access((SELECT auth.uid()), l.course_id::integer))
    )
  );
