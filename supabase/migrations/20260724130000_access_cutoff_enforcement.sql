-- Issue #494 — real access enforcement for over-limit tenants.
--
-- Adds tenants.access_cutoff_at: a scheduled/active tenant-wide access cutoff
-- timestamp, set by the app layer (lib/billing/access-cutoff.ts) when a
-- tenant's usage exceeds its current plan's limits, and cleared once
-- resolved (upgrade or reduced usage). NULL = no cutoff scheduled or active.
--
-- has_course_access() is the single source of truth for student course
-- access (see docs/DATABASE_SCHEMA.md); this migration adds one additive
-- condition so a cutoff denies access tenant-wide without touching any other
-- entitlement semantics.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_cutoff_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenants_access_cutoff_at
  ON tenants (access_cutoff_at)
  WHERE access_cutoff_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    JOIN tenants t ON t.id = e.tenant_id
    WHERE e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND (t.access_cutoff_at IS NULL OR t.access_cutoff_at > now())
  );
$function$;
