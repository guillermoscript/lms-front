-- =============================================================================
-- Tenant bans (#892).
--
-- Removing a member (`status = 'removed'`, #550) is not a ban: the person can
-- walk straight back in through the join link. A school also needs to be able
-- to say "not you again". `status = 'banned'` is that, and it has to hold on
-- every path that can create or reactivate a `tenant_users` row — which today
-- are app code (joinSchool, the tenant-switch route, checkout), not one SQL
-- function. So the ban is enforced here, at the row, and the app checks on top
-- only for the nicer message.
--
-- Design:
--   * `tenant_users.status` is an unconstrained varchar; 'banned' needs no enum
--     change. The CHECK below only ties the audit columns to it.
--   * A banned row can leave 'banned' ONLY through `lift_tenant_ban()`. A
--     BEFORE UPDATE trigger refuses every other transition — service role
--     included — so a join path that forgets to look (or a school admin who
--     PATCHes the row over PostgREST) cannot reinstate a banned user.
--   * Lifting does not reactivate. It lands on 'removed': the person then
--     rejoins through the normal join flow and its student-limit check, exactly
--     like a removed member. A ban never costs a seat (plan-limit counting only
--     ever looks at status = 'active', so `enforce_student_plan_limit` and
--     `count_plan_limit_usage` already ignore banned rows).
--   * The RPCs are service_role-only: the server action validates the caller's
--     tenant + admin role, then passes the actor explicitly.
-- =============================================================================

ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS banned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ban_reason text;

ALTER TABLE public.tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_ban_columns;
ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_ban_columns
  CHECK ((status = 'banned') = (banned_at IS NOT NULL));

COMMENT ON COLUMN public.tenant_users.banned_at IS
  'Set iff status = ''banned''. Issue #892.';
COMMENT ON COLUMN public.tenant_users.ban_reason IS
  'Optional note from the admin who banned the member. Issue #892.';

-- ---------------------------------------------------------------------------
-- Guard: a banned row stays banned unless lift_tenant_ban() is the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_tenant_ban()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'banned'
     AND NEW.status IS DISTINCT FROM 'banned'
     AND COALESCE(current_setting('app.lifting_tenant_ban', true), '') <> 'on' THEN
    RAISE EXCEPTION 'tenant_banned'
      USING ERRCODE = 'LM002',
            HINT = 'This user is banned from the school. Lift the ban first.';
  END IF;

  -- A ban cannot be shed by moving the row to another tenant/user.
  IF OLD.status = 'banned'
     AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'tenant_banned' USING ERRCODE = 'LM002';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tenant_ban ON public.tenant_users;
CREATE TRIGGER guard_tenant_ban
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tenant_ban();

-- ---------------------------------------------------------------------------
-- ban_tenant_member — idempotent. Refuses the actor banning themselves and
-- banning the last active admin (a school nobody can administer).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ban_tenant_member(
  _tenant_id uuid,
  _user_id   uuid,
  _actor_id  uuid,
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.tenant_users%ROWTYPE;
  _admins integer;
BEGIN
  IF _user_id = _actor_id THEN
    RAISE EXCEPTION 'cannot_ban_self' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _row
  FROM public.tenant_users
  WHERE tenant_id = _tenant_id AND user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF _row.status = 'banned' THEN
    RETURN;
  END IF;

  IF _row.role = 'admin' AND _row.status = 'active' THEN
    SELECT count(*) INTO _admins
    FROM public.tenant_users
    WHERE tenant_id = _tenant_id AND role = 'admin' AND status = 'active';
    IF _admins <= 1 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.tenant_users
  SET status     = 'banned',
      banned_at  = now(),
      banned_by  = _actor_id,
      ban_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
  WHERE id = _row.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- lift_tenant_ban — lands on 'removed' (see header), clears the audit columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lift_tenant_ban(
  _tenant_id uuid,
  _user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.lifting_tenant_ban', 'on', true);

  UPDATE public.tenant_users
  SET status     = 'removed',
      banned_at  = NULL,
      banned_by  = NULL,
      ban_reason = NULL
  WHERE tenant_id = _tenant_id
    AND user_id = _user_id
    AND status = 'banned';

  PERFORM set_config('app.lifting_tenant_ban', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ban_tenant_member(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lift_tenant_ban(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ban_tenant_member(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lift_tenant_ban(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.ban_tenant_member(uuid, uuid, uuid, text) IS
  'Ban a member from a school. service_role only; the caller validates the actor is an admin of _tenant_id. Issue #892.';
COMMENT ON FUNCTION public.lift_tenant_ban(uuid, uuid) IS
  'The only path out of status = ''banned'' (guard_tenant_ban). Lands on removed, not active. Issue #892.';
