-- #984: a super admin creating a school on someone's behalf invites the owner as
-- an ADMIN. tenant_invitations.role was limited to student/teacher.
ALTER TABLE public.tenant_invitations DROP CONSTRAINT IF EXISTS tenant_invitations_role_check;
ALTER TABLE public.tenant_invitations
  ADD CONSTRAINT tenant_invitations_role_check CHECK (role IN ('student', 'teacher', 'admin'));
