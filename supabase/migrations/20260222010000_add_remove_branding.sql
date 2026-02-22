-- Add remove_branding feature to platform_plans
-- free/starter = false, pro/business/enterprise = true

UPDATE platform_plans
SET limits = limits || '{"remove_branding": true}'::jsonb
WHERE slug IN ('pro', 'business', 'enterprise');

UPDATE platform_plans
SET limits = limits || '{"remove_branding": false}'::jsonb
WHERE slug IN ('free', 'starter');
