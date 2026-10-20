-- Custom domains: proxy.ts resolves a non-platform host via tenants.domain.
-- Normalise to lower-case and keep each domain pointing at exactly one tenant.
UPDATE tenants SET domain = lower(trim(domain)) WHERE domain IS NOT NULL;
UPDATE tenants SET domain = NULL WHERE domain = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain_unique ON tenants (lower(domain)) WHERE domain IS NOT NULL;
