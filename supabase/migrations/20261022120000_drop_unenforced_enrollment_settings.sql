-- These tenant_settings keys had a form and an MCP field but no reader anywhere
-- (access and its expiry live on `entitlements`). Drop the orphan rows.
DELETE FROM tenant_settings
WHERE setting_key IN (
  'auto_enrollment',
  'allow_self_enrollment',
  'require_enrollment_approval',
  'max_enrollments_per_user',
  'enrollment_expiration_days',
  'course_capacity_enabled'
);
