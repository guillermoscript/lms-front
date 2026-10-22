-- Content-read gates (security audit follow-up).
--
-- 1. lessons: the authenticated preview branch now honours the school's
--    `free_preview_enabled` switch (same expression as the anon policy in
--    20260920130000). Missing row = ON.
-- 2. lessons / exams / exercises: the entitled (has_course_access) branch only
--    sees PUBLISHED rows (lessons also: publish_at null or past). Staff of the
--    tenant (is_tenant_staff) and the course author keep seeing drafts.
-- 3. storage `payment-proofs`: SELECT scoped to the uploader, staff of the
--    owning tenant, and super admins (was: any logged-in user).
--
-- Path layout (see app/actions/payment-requests.ts, app/actions/admin/billing.ts):
--   student/{tenant_id}/{user_id}/{request_id}/proof.ext   (student upload)
--   platform/{tenant_id}/{request_id}/proof.ext            (school admin upload)

-- ---------------------------------------------------------------- lessons
DROP POLICY IF EXISTS "Users can view tenant lessons" ON public.lessons;

CREATE POLICY "Users can view tenant lessons" ON public.lessons
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      -- staff of this tenant: everything, drafts included
      (SELECT public.is_tenant_staff())
      -- course author: everything in their course
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = lessons.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      -- entitled student: published and already live
      OR (
        status = 'published'
        AND (publish_at IS NULL OR publish_at <= now())
        AND public.has_course_access((SELECT auth.uid()), lessons.course_id::integer)
      )
      -- free preview, only while the school switch is on
      OR (
        is_preview = true
        AND status = 'published'
        AND (publish_at IS NULL OR publish_at <= now())
        AND COALESCE(
          (
            SELECT (ts.setting_value ->> 'enabled')::boolean
            FROM public.tenant_settings ts
            WHERE ts.tenant_id = (SELECT public.get_tenant_id())
              AND ts.setting_key = 'free_preview_enabled'
          ),
          true
        )
        AND EXISTS (
          SELECT 1 FROM public.courses c
          WHERE c.course_id = lessons.course_id
            AND c.status = 'published'
            AND c.tenant_id = lessons.tenant_id
        )
      )
    )
  );

-- ------------------------------------------------------------------ exams
DROP POLICY IF EXISTS "Students can view tenant exams" ON public.exams;

CREATE POLICY "Students can view tenant exams" ON public.exams
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = exams.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR (
        status = 'published'
        AND public.has_course_access((SELECT auth.uid()), exams.course_id)
      )
    )
  );

-- -------------------------------------------------------------- exercises
DROP POLICY IF EXISTS "Users can view tenant exercises" ON public.exercises;

CREATE POLICY "Users can view tenant exercises" ON public.exercises
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (
      (SELECT public.is_tenant_staff())
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = exercises.course_id
          AND c.author_id = (SELECT auth.uid())
      )
      OR (
        status = 'published'
        AND public.has_course_access((SELECT auth.uid()), exercises.course_id)
      )
    )
  );

-- ---------------------------------------------------------- payment-proofs
DROP POLICY IF EXISTS "Users read payment proofs" ON storage.objects;

CREATE POLICY "Users read payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      -- uploader (also covers createSignedUrl right after upload)
      owner_id = (SELECT auth.uid())::text
      OR (SELECT public.is_super_admin())
      -- student/{tenant}/{user}/...: the student themself
      OR (
        (storage.foldername(name))[1] = 'student'
        AND (storage.foldername(name))[3] = (SELECT auth.uid())::text
      )
      -- student/{tenant}/...: active teacher/admin of that tenant
      OR (
        (storage.foldername(name))[1] = 'student'
        AND EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = (SELECT auth.uid())
            AND tu.tenant_id::text = (storage.foldername(name))[2]
            AND tu.status = 'active'
            AND tu.role::text IN ('teacher', 'admin')
        )
      )
      -- platform/{tenant}/...: active admin of that tenant
      OR (
        (storage.foldername(name))[1] = 'platform'
        AND EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = (SELECT auth.uid())
            AND tu.tenant_id::text = (storage.foldername(name))[2]
            AND tu.status = 'active'
            AND tu.role::text = 'admin'
        )
      )
    )
  );
