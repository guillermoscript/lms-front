-- Issue #658: enforce plan limits at the database level.
--
-- Until now the only limit check for courses was `checkCourseLimit()` in
-- app/actions/teacher/courses.ts, and the only one for student seats was the
-- pre-check in `joinCurrentSchool`. Every other writer bypassed them: the MCP
-- `lms_create_course` tool (RLS-scoped insert), MCP `lms_update_course`
-- un-archiving a course, admin `restoreCourse`, and raw SQL. A Free-plan tenant
-- in production reached 6/5 courses that way and was scheduled for a tenant-wide
-- access cutoff with no warning.
--
-- The rules below are the single, unbypassable enforcement point:
--
--   * A row is COUNTED when it is a non-archived course (`status <> 'archived'`)
--     or an active student membership (`role = 'student' AND status = 'active'`)
--     — exactly the queries `countTenantUsage()` in lib/billing/plan-limits.ts
--     runs, so the number the trigger enforces is the number the billing page,
--     the downgrade pre-flight and the access-cutoff reconciler all show.
--   * The limit is `platform_plans.limits ->> 'max_courses' / 'max_students'`
--     resolved through `tenants.plan`, mirroring `getTenantPlanLimits()`:
--     no `is_active` filter (retiring a plan must not change what its
--     subscribers may do), and `-1` or a missing key / missing plan row means
--     unlimited (fail-open, like every other reader).
--   * The trigger fires only when a row BECOMES counted (insert, un-archive,
--     activation, tenant move). Archiving, removing, editing a title, or
--     updating an already-counted row never touches the limit, so a tenant that
--     is already over its limit (e.g. after a downgrade) can still edit and
--     archive its way back under it.
--   * The check is `count >= max` on the rows that already exist, i.e. the new
--     row would be the (max+1)th. Concurrent inserts for one tenant are
--     serialised with a transaction-scoped advisory lock so two requests racing
--     for the last seat cannot both pass the count.
--   * Failure raises SQLSTATE `LM001` with message `plan_limit_exceeded:<resource>`
--     (`courses` | `students`). App code maps that code to the existing upgrade
--     copy (lib/billing/plan-limit-error.ts) — never match on the message text.
--   * `SET app.bypass_plan_limits = 'on'` disables the check for the session.
--     It is for operators and the local seed only; PostgREST clients cannot set
--     arbitrary GUCs, and every SECURITY DEFINER function here pins search_path.
--
-- `get_tenant_plan_usage(_tenant_id)` exposes the same counts + limits to
-- callers that cannot count for themselves because of RLS (the MCP server runs
-- on the caller's own token, and a teacher only sees their own courses).

-- ---------------------------------------------------------------------------
-- 1. Limit resolver — one place that knows how a tenant maps to a plan limit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_plan_limit(_tenant_id uuid, _key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN jsonb_typeof(pp.limits -> _key) = 'number'
             THEN (pp.limits ->> _key)::numeric::integer
           ELSE -1
         END
  FROM public.tenants t
  LEFT JOIN public.platform_plans pp ON pp.slug = COALESCE(t.plan, 'free')
  WHERE t.id = _tenant_id;
$$;

COMMENT ON FUNCTION public.tenant_plan_limit(uuid, text) IS
  'Plan limit for a tenant (`max_courses` / `max_students`) resolved through tenants.plan → platform_plans.limits. -1 = unlimited; NULL when the tenant does not exist. Issue #658.';

REVOKE ALL ON FUNCTION public.tenant_plan_limit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_plan_limit(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Usage counter — must stay identical to countTenantUsage() in
--    lib/billing/plan-limits.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_plan_limit_usage(_tenant_id uuid, _resource text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _resource
           WHEN 'courses' THEN (
             SELECT count(*)::integer
             FROM public.courses c
             WHERE c.tenant_id = _tenant_id
               AND c.status <> 'archived'
           )
           WHEN 'students' THEN (
             SELECT count(*)::integer
             FROM public.tenant_users tu
             WHERE tu.tenant_id = _tenant_id
               AND tu.role = 'student'
               AND tu.status = 'active'
           )
         END;
$$;

COMMENT ON FUNCTION public.count_plan_limit_usage(uuid, text) IS
  'Tenant usage against a plan limit: non-archived courses or active student memberships. Mirrors countTenantUsage() in lib/billing/plan-limits.ts. Issue #658.';

REVOKE ALL ON FUNCTION public.count_plan_limit_usage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_plan_limit_usage(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Shared guard — raises LM001 when adding one more `_resource` row to the
--    tenant would exceed its plan. Takes the per-tenant advisory lock so the
--    count and the write that follows are serialised across sessions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_plan_limit_headroom(_tenant_id uuid, _resource text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _max integer;
  _current integer;
BEGIN
  IF _tenant_id IS NULL THEN
    RETURN;
  END IF;

  _key := CASE _resource
            WHEN 'courses' THEN 'max_courses'
            WHEN 'students' THEN 'max_students'
          END;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'assert_plan_limit_headroom: unknown resource %', _resource;
  END IF;

  _max := public.tenant_plan_limit(_tenant_id, _key);
  -- Unknown tenant or unlimited plan: nothing to enforce.
  IF _max IS NULL OR _max < 0 THEN
    RETURN;
  END IF;

  -- Serialise per (tenant, resource). Released at transaction end, and each
  -- plpgsql statement takes a fresh snapshot under READ COMMITTED, so the
  -- count below sees whatever the previous holder committed.
  PERFORM pg_advisory_xact_lock(hashtext('plan_limit:' || _resource || ':' || _tenant_id::text));

  _current := public.count_plan_limit_usage(_tenant_id, _resource);

  IF _current >= _max THEN
    RAISE EXCEPTION 'plan_limit_exceeded:%', _resource
      USING ERRCODE = 'LM001',
            DETAIL  = format('tenant %s already has %s %s; its plan allows %s',
                             _tenant_id, _current, _resource, _max),
            HINT    = 'Upgrade the plan or free a slot (archive a course / remove a student).';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_plan_limit_headroom(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_plan_limit_headroom(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. courses: a row becomes counted on INSERT with a non-archived status, or on
--    UPDATE when it un-archives or moves to another tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_course_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_plan_limits', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- The row will not be counted → it cannot consume a slot.
  IF NEW.status IS NULL OR NEW.status = 'archived' THEN
    RETURN NEW;
  END IF;

  -- Already counted in this tenant before the update → no new slot consumed.
  IF TG_OP = 'UPDATE'
     AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND OLD.status IS NOT NULL
     AND OLD.status <> 'archived' THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_plan_limit_headroom(NEW.tenant_id, 'courses');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_course_plan_limit ON public.courses;
CREATE TRIGGER enforce_course_plan_limit
  BEFORE INSERT OR UPDATE OF status, tenant_id ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_plan_limit();

-- ---------------------------------------------------------------------------
-- 5. tenant_users: a row becomes counted when it is (or becomes) an active
--    student membership in this tenant. Admin/teacher rows never count, so
--    `create_school()` and staff invites are untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_student_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_plan_limits', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM 'student' OR NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND OLD.role = 'student'
     AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_plan_limit_headroom(NEW.tenant_id, 'students');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_student_plan_limit ON public.tenant_users;
CREATE TRIGGER enforce_student_plan_limit
  BEFORE INSERT OR UPDATE OF role, status, tenant_id ON public.tenant_users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_plan_limit();

-- The counts above filter on (tenant_id, status) and (tenant_id, role, status);
-- the existing single-column indexes make them a tenant-scoped scan, which is
-- fine at today's sizes but these keep the trigger O(log n) as tenants grow.
CREATE INDEX IF NOT EXISTS idx_courses_tenant_status
  ON public.courses (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_role_status
  ON public.tenant_users (tenant_id, role, status);

-- ---------------------------------------------------------------------------
-- 6. RPC for pre-checks by RLS-scoped callers (MCP tools, client hooks).
--    Members of the tenant, super admins and the service role may call it;
--    anon and non-members get insufficient_privilege. A session with no JWT at
--    all (psql, a migration, an operator) is trusted, the same way the tables
--    themselves are. Returns the same shape the app already uses: usage
--    counts + limits (-1 = unlimited).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_plan_usage(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  -- auth.jwt() is NULL outside PostgREST; auth.role() is the JWT's role claim.
  IF auth.jwt() IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF _uid IS NULL THEN
      RAISE EXCEPTION 'get_tenant_plan_usage: authentication required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
         SELECT 1 FROM public.tenant_users
         WHERE tenant_id = _tenant_id AND user_id = _uid AND status = 'active'
       )
       AND NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _uid) THEN
      RAISE EXCEPTION 'get_tenant_plan_usage: not a member of this tenant'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'courses',      public.count_plan_limit_usage(_tenant_id, 'courses'),
    'students',     public.count_plan_limit_usage(_tenant_id, 'students'),
    'max_courses',  COALESCE(public.tenant_plan_limit(_tenant_id, 'max_courses'), -1),
    'max_students', COALESCE(public.tenant_plan_limit(_tenant_id, 'max_students'), -1)
  );
END;
$$;

COMMENT ON FUNCTION public.get_tenant_plan_usage(uuid) IS
  'Usage + limits for plan-limit pre-checks by RLS-scoped callers. Members / super admins / service role only. Issue #658.';

REVOKE ALL ON FUNCTION public.get_tenant_plan_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_plan_usage(uuid) TO authenticated, service_role;
