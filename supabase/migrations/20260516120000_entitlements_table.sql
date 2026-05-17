-- Phase 1 / Migration A — Entitlements model: additive, no behaviour change.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md
--
-- Introduces `entitlements` (one row per access source per user+course),
-- alongside the existing `enrollments` table. Nothing reads it yet.

-- 1. Enum types (idempotent) -------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_source') THEN
    CREATE TYPE entitlement_source AS ENUM ('product', 'subscription', 'free', 'admin_grant');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_status') THEN
    CREATE TYPE entitlement_status AS ENUM ('active', 'revoked', 'expired');
  END IF;
END $$;

-- 2. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlements (
  entitlement_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid    NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  course_id       integer NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  tenant_id       uuid    NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  source_type     entitlement_source NOT NULL,
  source_id       integer,             -- product_id | subscription_id; NULL for free / admin_grant
  status          entitlement_status NOT NULL DEFAULT 'active',
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,         -- NULL = perpetual (products, free)
  revoked_at      timestamptz,
  CONSTRAINT entitlements_source_id_shape CHECK (
       (source_type IN ('product', 'subscription') AND source_id IS NOT NULL)
    OR (source_type IN ('free', 'admin_grant')     AND source_id IS NULL)
  ),
  -- One entitlement per (user, course, source). NULLS NOT DISTINCT so that two
  -- 'free'/'admin_grant' rows (source_id NULL) for the same course also collide.
  CONSTRAINT entitlements_unique_source
    UNIQUE NULLS NOT DISTINCT (user_id, course_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_access ON entitlements (user_id, course_id, status);
CREATE INDEX IF NOT EXISTS idx_entitlements_tenant ON entitlements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_source ON entitlements (source_type, source_id);

-- 3. RLS — read-only for end users; all writes go through SECURITY DEFINER RPCs
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own entitlements" ON entitlements;
CREATE POLICY "Students view own entitlements" ON entitlements
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND tenant_id = (SELECT get_tenant_id()));

DROP POLICY IF EXISTS "Teachers and admins view tenant entitlements" ON entitlements;
CREATE POLICY "Teachers and admins view tenant entitlements" ON entitlements
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT get_tenant_id())
         AND (SELECT get_tenant_role()) = ANY (ARRAY['teacher', 'admin']));

DROP POLICY IF EXISTS "Super admins view all entitlements" ON entitlements;
CREATE POLICY "Super admins view all entitlements" ON entitlements
  FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

-- 4. Access-check helper — single source of truth for "can this user open course X"
CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$function$;
