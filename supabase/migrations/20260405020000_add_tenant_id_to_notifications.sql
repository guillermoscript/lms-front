-- =============================================================================
-- Add tenant_id to notifications table
--
-- The notifications table was missing tenant_id, causing queries to fail with
-- "column notifications.tenant_id does not exist".
-- =============================================================================

ALTER TABLE public.notifications
  ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);

-- Backfill: set tenant_id from the created_by user's tenant
UPDATE public.notifications n
SET tenant_id = COALESCE(
  (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = n.created_by LIMIT 1),
  '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE n.tenant_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.notifications
  ALTER COLUMN tenant_id SET NOT NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);

-- RLS policy for tenant scoping
CREATE POLICY "Users can view tenant notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (tenant_id = (select public.get_tenant_id()));

CREATE POLICY "Admins can create tenant notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (select public.get_tenant_id()) AND (select public.get_tenant_role()) IN ('admin', 'teacher'));

CREATE POLICY "Admins can update tenant notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (tenant_id = (select public.get_tenant_id()) AND (select public.get_tenant_role()) IN ('admin', 'teacher'));

CREATE POLICY "Admins can delete tenant notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (tenant_id = (select public.get_tenant_id()) AND (select public.get_tenant_role()) = 'admin');
