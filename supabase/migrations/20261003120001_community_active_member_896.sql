-- Community reads and writes need an ACTIVE membership, not just the JWT claim (#896).
--
-- `community_can_write()` and the community SELECT policies trusted the JWT
-- `tenant_id` alone. `removeTenantMember` sets `tenant_users.status = 'removed'`
-- but used to leave `app_metadata.tenant_id` alone, so `custom_access_token_hook`
-- kept minting this school's claim on every refresh: a removed member could
-- keep reading the feed and posting through the native app or MCP forever, and
-- a banned one until the access token expired. The web refused both because
-- it reads `tenant_users`. This makes the database agree with the web.
--
-- `is_member_of(tenant)` is the row-scoped membership check, next to
-- `is_staff_of` / `is_admin_of` (20260830140000).

CREATE OR REPLACE FUNCTION public.is_member_of(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.tenant_id = _tenant
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_member_of(uuid) IS
  'Active membership (any role) in the given tenant (tenant_users is authoritative). Row-scoped like is_staff_of().';

-- Every community INSERT policy (posts, comments, reactions, poll votes) and
-- the accepted-answer UPDATE go through this. Only RLS policies call it, so
-- service-role writes (the web actions, SECURITY DEFINER triggers) are untouched.
CREATE OR REPLACE FUNCTION public.community_can_write(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id = get_tenant_id()
     AND is_member_of(_tenant_id)
     AND community_enabled(_tenant_id)
     AND NOT community_is_muted(_tenant_id, auth.uid());
$$;

-- Restrictive: ANDed with every SELECT policy. Super admins keep their view.
DROP POLICY IF EXISTS "Only active members read the community" ON public.community_posts;
CREATE POLICY "Only active members read the community"
  ON public.community_posts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (is_super_admin() OR is_member_of(tenant_id));

DROP POLICY IF EXISTS "Only active members read the community" ON public.community_comments;
CREATE POLICY "Only active members read the community"
  ON public.community_comments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (is_super_admin() OR is_member_of(tenant_id));

-- Reports skip community_can_write on purpose (a muted member may still
-- report), so they get the membership check on their own.
DROP POLICY IF EXISTS "Only active members report" ON public.community_flags;
CREATE POLICY "Only active members report"
  ON public.community_flags AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (is_member_of(tenant_id));
