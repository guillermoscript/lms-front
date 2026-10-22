-- Rollback for 20261020140000_tenant_invitations_admin_role.sql.
-- Pending admin invitations cannot satisfy the old CHECK, so they are removed first.
DELETE FROM public.tenant_invitations WHERE role = 'admin';
ALTER TABLE public.tenant_invitations DROP CONSTRAINT IF EXISTS tenant_invitations_role_check;
ALTER TABLE public.tenant_invitations
  ADD CONSTRAINT tenant_invitations_role_check CHECK (role IN ('student', 'teacher'));
