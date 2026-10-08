-- Issue #929 — platform fee gate hardening (carried from the PR #939 review).
-- Design: docs/PLATFORM_FEE_LEDGER_DESIGN.md 4.1, 4.2, D5, D8.
-- Builds on 20261009110000_platform_fee_gate_929.
--
-- 1. is_preblock_request_settlement() no longer trusts
--    payment_requests.created_at. A student can set created_at on INSERT
--    (RLS "Students can create payment requests" + table INSERT grant) and a
--    tenant admin can UPDATE any column of a request of their own tenant, so
--    both could forge "opened before the block" — and an admin could even
--    repurpose an old pre-block request for a new buyer or product. The
--    predicate now matches a SERVER-WRITTEN snapshot instead:
--      fee_block_open_requests — taken by a trigger at the instant
--      tenant_fee_standing.blocked_at goes NULL -> NOT NULL, holding the open
--      requests (and their user/product/plan AS THEY WERE) of that tenant.
--      Cleared when the block lifts. No grants to anon/authenticated.
--    Defence in depth: a BEFORE INSERT/UPDATE trigger on payment_requests
--    stamps created_at server-side for anon/authenticated writers (an INSERT
--    gets now(); an UPDATE keeps the old value). Service-role and definer code
--    is trusted server code and keeps its explicit value.
--
-- 2. self_enroll_subscription_course() (browse page, public plan button, MCP
--    lms_enroll_in_course) refuses a NEW course choice while the school's
--    sales are blocked (design 4.1, owner decision: follow the design), with
--    SQLSTATE LM003 'sales_blocked:fees'. Re-enrolling a course the student
--    already held through a subscription keeps working (not a new sale).
--    Body identical to the live definition (20260516150000) plus that check.
--
-- INERT BY DEFAULT. Both gates read is_tenant_sales_blocked(), false unless
-- platform_fee_config.enforcement_mode = 'enforce' (shipped: notify_only).
--
-- D5. Nothing here touches the course access check, existing grants or any
-- UPDATE of transactions.
--
-- SAFETY. Additive: one new table, new functions/triggers, two CREATE OR
-- REPLACE of existing functions (signatures unchanged, grants preserved). No
-- CHECK constraints. Rollback: rollback/20261009120000_platform_fee_hardening_929.down.sql.

-- ─── 1a. Snapshot of open manual requests at block time ────────────────────

CREATE TABLE IF NOT EXISTS public.fee_block_open_requests (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id bigint NOT NULL REFERENCES public.payment_requests(request_id) ON DELETE CASCADE,
  -- The block episode this snapshot belongs to (tenant_fee_standing.blocked_at).
  blocked_at timestamptz NOT NULL,
  -- Copied from the request at block time; the predicate matches THESE, never
  -- the live (admin-editable) row.
  user_id uuid,
  product_id integer,
  plan_id integer,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, request_id)
);

COMMENT ON TABLE public.fee_block_open_requests IS
  'Issue #929: open manual payment requests of a tenant captured at the instant its fee block started. is_preblock_request_settlement() admits only these (with their captured buyer/product/plan). Written by trigger only; server-write-only.';

ALTER TABLE public.fee_block_open_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fee_block_open_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fee_block_open_requests TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_fee_block_open_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.blocked_at IS NULL THEN
    -- Block lifted (or never set): the snapshot is meaningless now.
    DELETE FROM fee_block_open_requests WHERE tenant_id = NEW.tenant_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.blocked_at IS NOT DISTINCT FROM NEW.blocked_at THEN
    RETURN NEW;
  END IF;

  -- A new block episode: replace any stale snapshot with the requests that
  -- are open right now. created_at is not consulted.
  DELETE FROM fee_block_open_requests WHERE tenant_id = NEW.tenant_id;
  INSERT INTO fee_block_open_requests (tenant_id, request_id, blocked_at, user_id, product_id, plan_id)
  SELECT pr.tenant_id, pr.request_id, NEW.blocked_at, pr.user_id, pr.product_id, pr.plan_id
  FROM payment_requests pr
  WHERE pr.tenant_id = NEW.tenant_id
    AND pr.status IN ('pending', 'contacted', 'payment_received');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS after_tenant_fee_standing_block_snapshot ON public.tenant_fee_standing;
CREATE TRIGGER after_tenant_fee_standing_block_snapshot
  AFTER INSERT OR UPDATE OF blocked_at ON public.tenant_fee_standing
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_fee_block_open_requests();

-- Backfill: a tenant already blocked before this migration (none expected:
-- blocked_at is only written in 'enforce') gets the best snapshot available.
INSERT INTO public.fee_block_open_requests (tenant_id, request_id, blocked_at, user_id, product_id, plan_id)
SELECT pr.tenant_id, pr.request_id, s.blocked_at, pr.user_id, pr.product_id, pr.plan_id
FROM public.tenant_fee_standing s
JOIN public.payment_requests pr ON pr.tenant_id = s.tenant_id
WHERE s.blocked_at IS NOT NULL
  AND pr.status IN ('pending', 'contacted', 'payment_received')
  AND pr.created_at < s.blocked_at
ON CONFLICT (tenant_id, request_id) DO NOTHING;

-- ─── 1b. created_at is server-stamped for client writers ───────────────────

CREATE OR REPLACE FUNCTION public.stamp_payment_request_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- current_user is the PostgREST role for direct client writes; definer
  -- functions and the service role are trusted server code.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
    ELSE
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS before_payment_request_stamp_created_at ON public.payment_requests;
CREATE TRIGGER before_payment_request_stamp_created_at
  BEFORE INSERT OR UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_payment_request_created_at();

-- ─── 1c. The predicate reads the snapshot ──────────────────────────────────
-- Same signature and grants as 20261009110000. A manual transaction settles a
-- pre-block request only when ALL hold:
--   * the request was open when the CURRENT block started (snapshot of this
--     episode: b.blocked_at = s.blocked_at);
--   * the transaction's buyer / product / plan equal the CAPTURED ones;
--   * the live request is payment_received (money seen, admin-marked).
CREATE OR REPLACE FUNCTION public.is_preblock_request_settlement(
  _tenant_id uuid,
  _user_id uuid,
  _product_id integer,
  _plan_id integer,
  _payment_provider text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _payment_provider = 'manual'
     AND _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM fee_block_open_requests b
       JOIN tenant_fee_standing s
         ON s.tenant_id = b.tenant_id
        AND s.blocked_at IS NOT NULL
        AND s.blocked_at = b.blocked_at
       JOIN payment_requests pr
         ON pr.request_id = b.request_id
        AND pr.tenant_id = b.tenant_id
       WHERE b.tenant_id = _tenant_id
         AND b.user_id = _user_id
         AND b.product_id IS NOT DISTINCT FROM _product_id
         AND b.plan_id IS NOT DISTINCT FROM _plan_id
         AND pr.status = 'payment_received'
     );
$function$;

COMMENT ON FUNCTION public.is_preblock_request_settlement(uuid, uuid, integer, integer, text) IS
  'Issue #929: true when a manual transaction settles a payment request (payment_received) that was open when the current fee block started, for the buyer/product/plan captured then (fee_block_open_requests). Never reads payment_requests.created_at. Service role only.';

-- ─── 2. Subscription self-enrollment gate (4.1) ────────────────────────────
-- "Already held" = the student holds (or held) this course through a
-- subscription of this school: choosing it again is not a new enrollment.
CREATE OR REPLACE FUNCTION public.subscription_enrollment_allowed(
  _tenant_id uuid,
  _user_id uuid,
  _course_id integer
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_tenant_sales_blocked(_tenant_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.tenant_id = _tenant_id
      AND e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.source_type = 'subscription'
  );
END;
$function$;

COMMENT ON FUNCTION public.subscription_enrollment_allowed(uuid, uuid, integer) IS
  'Issue #929: may this subscriber pick this course now? False only while sales are blocked and the user never held the course through a subscription of this school.';

REVOKE EXECUTE ON FUNCTION public.subscription_enrollment_allowed(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_enrollment_allowed(uuid, uuid, integer) TO service_role;

-- Body identical to the live definition (20260516150000) except the marked check.
CREATE OR REPLACE FUNCTION public.self_enroll_subscription_course(_course_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _user_id   uuid := auth.uid();
    _tenant_id uuid;
    _subscription_id integer;
    _end_date  timestamptz;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT tenant_id INTO _tenant_id FROM courses WHERE course_id = _course_id;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    SELECT s.subscription_id, s.end_date
    INTO _subscription_id, _end_date
    FROM subscriptions s
    JOIN plan_courses pc ON pc.plan_id = s.plan_id
    WHERE s.user_id = _user_id
      AND s.tenant_id = _tenant_id
      AND s.subscription_status IN ('active', 'renewed')
      AND s.end_date > now()
      AND pc.course_id = _course_id
    ORDER BY s.end_date DESC
    LIMIT 1;

    IF _subscription_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription covers this course';
    END IF;

    -- #929 fee gate: no NEW course choice while the school's sales are blocked.
    IF NOT subscription_enrollment_allowed(_tenant_id, _user_id, _course_id) THEN
        RAISE EXCEPTION 'sales_blocked:fees' USING ERRCODE = 'LM003';
    END IF;

    INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
    VALUES (_user_id, _course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
    ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
        status     = 'active',
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        tenant_id  = EXCLUDED.tenant_id;

    INSERT INTO enrollments (user_id, course_id, enrollment_date, status, tenant_id)
    VALUES (_user_id, _course_id, NOW(), 'active', _tenant_id)
    ON CONFLICT (user_id, course_id) DO UPDATE SET
        status    = 'active',
        tenant_id = EXCLUDED.tenant_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.snapshot_fee_block_open_requests() FROM PUBLIC, anon, authenticated;
