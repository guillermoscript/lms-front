-- Lightweight invitation tracking for admin-sent invitations
-- When a user joins via /join-school, the system checks for a pending invitation
-- and auto-assigns the invited role (teacher/student) instead of defaulting to student.

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('student', 'teacher')),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (tenant_id, email, status) -- one pending invite per email per tenant
);

-- Index for fast lookup when a user joins
CREATE INDEX idx_tenant_invitations_email_status
  ON tenant_invitations (email, status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view/manage invitations for their tenant
CREATE POLICY "Admins can manage tenant invitations"
  ON tenant_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_users.tenant_id = tenant_invitations.tenant_id
        AND tenant_users.user_id = auth.uid()
        AND tenant_users.role = 'admin'
        AND tenant_users.status = 'active'
    )
  );

-- Service role can always access (for join-school flow)
CREATE POLICY "Service role full access on tenant_invitations"
  ON tenant_invitations
  FOR ALL
  USING (auth.role() = 'service_role');
