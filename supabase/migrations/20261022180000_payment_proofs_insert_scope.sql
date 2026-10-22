-- "Users upload payment proofs" let any logged-in user write ANY path in the
-- bucket (e.g. over another tenant's proof, or plant files under a tenant they
-- do not belong to). Path layout (app/actions/payment-requests.ts, admin/billing.ts):
--   student/{tenant_id}/{user_id}/{request_id}/proof.ext   student, active member
--   platform/{tenant_id}/{request_id}/proof.ext            active admin of that tenant
DROP POLICY IF EXISTS "Users upload payment proofs" ON storage.objects;

CREATE POLICY "Users upload payment proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (
      (
        (storage.foldername(name))[1] = 'student'
        AND (storage.foldername(name))[3] = (SELECT auth.uid())::text
        AND EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = (SELECT auth.uid())
            AND tu.tenant_id::text = (storage.foldername(name))[2]
            AND tu.status = 'active'
        )
      )
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
