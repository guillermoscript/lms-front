-- Widen mcp_audit_log.user_role CHECK to include 'student' (#401)
--
-- mcp_audit_log was created (20260213230911) when the MCP server only served
-- teachers/admins. The student tool tier (Epic #348) was added later without
-- widening this constraint, so the audit middleware's fire-and-forget insert
-- fails on every student tool call and student calls are silently unaudited.
--
-- Metadata-only change: drop + re-add the CHECK. Existing rows are all
-- teacher/admin and trivially satisfy the widened constraint.

ALTER TABLE mcp_audit_log
  DROP CONSTRAINT IF EXISTS mcp_audit_log_user_role_check;

ALTER TABLE mcp_audit_log
  ADD CONSTRAINT mcp_audit_log_user_role_check
  CHECK (user_role IN ('student', 'teacher', 'admin'));
