-- Issue #929 — platform fee pay-now, settlement and super-admin ledger tools
-- (wave 2, slicing steps 5 and 7-data). Design: docs/PLATFORM_FEE_LEDGER_DESIGN.md
-- 2.2, 2.4, 3.3, 4.4. Builds on 20261009100000 / 20261009110000 / 20261009120000.
--
--   1. platform_payment_requests can carry a FEE request: plan_id becomes
--      nullable and a request names exactly one of plan_id / fee_payment_id
--      (CHECK, NOT VALID then VALIDATE). The fee request's money row is a
--      pending platform_fee_payments row created with it.
--   2. platform_fee_payments: status 'reversed' (+ reversed_at /
--      reversal_reason) for refunds and chargebacks — the ledger stays
--      append-only (amount > 0, no negative rows); review_reason flags a
--      settlement whose amount/currency did not match (never credited).
--   3. tenant_fee_standing.enforcement_exempt: a super admin can exempt a
--      tenant from the block; is_tenant_sales_blocked() honours it.
--   4. platform_fee_audit_log: every super-admin ledger action and every
--      automated reversal, with actor and reason.
--   5. Functions (SECURITY DEFINER, service role only; the server action
--      verifies the caller and the function re-checks super_admins):
--        settle_platform_fee_payment()            webhook settle, idempotent
--        reverse_platform_fee_payment_by_charge() refund / chargeback
--        confirm_platform_fee_request()           super admin, manual rail
--        record_platform_fee_payment()            super admin, offline / waiver
--        admin_reverse_platform_fee_payment()     super admin, adjust down
--        set_tenant_fee_exemption()               super admin
--      Each settle path calls reevaluate_tenant_fee_standing() in the SAME
--      transaction, so a paid school is unblocked immediately (2.4).
--   6. A rejected / expired fee request cancels its pending payment row.
--
-- Pay-now never touches transactions, course access grants or the access check (D5).
--
-- SAFETY. Additive. New CHECKs are NOT VALID then VALIDATE. plan_id DROP NOT
-- NULL is metadata-only. Rollback: rollback/20261009130000_platform_fee_paynow_929.down.sql.

-- ─── 1. Fee requests on platform_payment_requests ───────────────────────────

ALTER TABLE public.platform_payment_requests
  ADD COLUMN IF NOT EXISTS fee_payment_id uuid
    REFERENCES public.platform_fee_payments(payment_id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.platform_payment_requests.fee_payment_id IS
  'Issue #929: the pending platform_fee_payments row a request_type = fee request settles. Exactly one of plan_id / fee_payment_id is set.';

ALTER TABLE public.platform_payment_requests ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.platform_payment_requests
  DROP CONSTRAINT IF EXISTS platform_payment_requests_plan_or_fee_check;
ALTER TABLE public.platform_payment_requests
  ADD CONSTRAINT platform_payment_requests_plan_or_fee_check CHECK (
    CASE
      WHEN fee_payment_id IS NOT NULL THEN plan_id IS NULL AND request_type = 'fee'
      ELSE plan_id IS NOT NULL AND request_type IS DISTINCT FROM 'fee'
    END
  ) NOT VALID;
ALTER TABLE public.platform_payment_requests
  VALIDATE CONSTRAINT platform_payment_requests_plan_or_fee_check;

CREATE UNIQUE INDEX IF NOT EXISTS platform_payment_requests_fee_payment_unique
  ON public.platform_payment_requests (fee_payment_id)
  WHERE fee_payment_id IS NOT NULL;

-- ─── 2. Payments: reversal + review flag ────────────────────────────────────

ALTER TABLE public.platform_fee_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_fee_payments.review_reason IS
  'Issue #929: set when a provider reported a payment that does not match this row (amount, currency, state). Such a payment is NOT credited; a super admin resolves it.';

ALTER TABLE public.platform_fee_payments DROP CONSTRAINT IF EXISTS platform_fee_payments_status_check;
ALTER TABLE public.platform_fee_payments
  ADD CONSTRAINT platform_fee_payments_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'reversed')) NOT VALID;
ALTER TABLE public.platform_fee_payments VALIDATE CONSTRAINT platform_fee_payments_status_check;

ALTER TABLE public.platform_fee_payments DROP CONSTRAINT IF EXISTS platform_fee_payments_reversal_check;
ALTER TABLE public.platform_fee_payments
  ADD CONSTRAINT platform_fee_payments_reversal_check
  CHECK ((status = 'reversed') = (reversed_at IS NOT NULL)) NOT VALID;
ALTER TABLE public.platform_fee_payments VALIDATE CONSTRAINT platform_fee_payments_reversal_check;

-- ─── 3. Enforcement exemption ───────────────────────────────────────────────

ALTER TABLE public.tenant_fee_standing
  ADD COLUMN IF NOT EXISTS enforcement_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ADD COLUMN IF NOT EXISTS exempt_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exempt_set_at timestamptz;

ALTER TABLE public.tenant_fee_standing DROP CONSTRAINT IF EXISTS tenant_fee_standing_exempt_not_blocked;
ALTER TABLE public.tenant_fee_standing
  ADD CONSTRAINT tenant_fee_standing_exempt_not_blocked
  CHECK (NOT (enforcement_exempt AND blocked_at IS NOT NULL)) NOT VALID;
ALTER TABLE public.tenant_fee_standing VALIDATE CONSTRAINT tenant_fee_standing_exempt_not_blocked;

CREATE OR REPLACE FUNCTION public.is_tenant_sales_blocked(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT c.enforcement_mode = 'enforce' FROM platform_fee_config c WHERE c.id),
    false
  )
  AND EXISTS (
    SELECT 1 FROM tenant_fee_standing s
    WHERE s.tenant_id = _tenant_id
      AND s.blocked_at IS NOT NULL
      AND NOT s.enforcement_exempt
  );
$function$;

COMMENT ON FUNCTION public.is_tenant_sales_blocked(uuid) IS
  'Issue #929: true only when platform_fee_config.enforcement_mode = enforce AND tenant_fee_standing.blocked_at is set AND the tenant is not exempt (D8). Gates NEW sales only; never course access (D5).';

-- ─── 4. Audit trail ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_fee_audit_log (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- NULL for automated actions (webhook reversal).
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'request_confirmed', 'offline_recorded', 'waived', 'payment_reversed',
    'exemption_set', 'exemption_cleared'
  )),
  payment_id uuid REFERENCES public.platform_fee_payments(payment_id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.platform_payment_requests(request_id) ON DELETE SET NULL,
  amount numeric(10,2),
  currency text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_fee_audit_log IS
  'Issue #929: append-only audit of platform fee ledger actions (super-admin confirm / offline / waiver / reversal / exemption, automated refund and chargeback reversals). Written only by the SECURITY DEFINER ledger functions.';

CREATE INDEX IF NOT EXISTS idx_platform_fee_audit_log_tenant
  ON public.platform_fee_audit_log (tenant_id, created_at DESC);

ALTER TABLE public.platform_fee_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view platform fee audit log" ON public.platform_fee_audit_log;
CREATE POLICY "Super admins can view platform fee audit log"
  ON public.platform_fee_audit_log FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

REVOKE ALL ON TABLE public.platform_fee_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_fee_audit_log TO authenticated;
GRANT ALL ON TABLE public.platform_fee_audit_log TO service_role;

-- ─── 5. Ledger functions ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_platform_fee_super_admin(_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = _actor) THEN
    RAISE EXCEPTION 'Only super admins can change the platform fee ledger'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Webhook settle (Stripe Checkout today). Idempotent on the payment row and
-- on (provider, provider_charge_id). A mismatch is NEVER credited (2.4, R7).
-- Returns: settled | duplicate | mismatch | not_pending | not_found.
CREATE OR REPLACE FUNCTION public.settle_platform_fee_payment(
  _payment_id uuid,
  _tenant_id uuid,
  _provider text,
  _provider_charge_id text,
  _amount numeric,
  _currency text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r platform_fee_payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM platform_fee_payments p WHERE p.payment_id = _payment_id FOR UPDATE;
  IF NOT FOUND OR r.tenant_id IS DISTINCT FROM _tenant_id OR r.provider IS DISTINCT FROM _provider THEN
    -- A signed event naming another tenant's row (or another rail) credits nothing.
    RETURN 'not_found';
  END IF;

  IF r.status = 'succeeded' THEN
    RETURN 'duplicate';
  END IF;

  IF _provider_charge_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM platform_fee_payments o
    WHERE o.provider = _provider
      AND o.provider_charge_id = _provider_charge_id
      AND o.payment_id <> _payment_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  IF r.status <> 'pending' THEN
    UPDATE platform_fee_payments
       SET review_reason = format('provider reported a payment for a %s row (charge %s)', r.status, COALESCE(_provider_charge_id, '?')),
           updated_at = now()
     WHERE payment_id = _payment_id;
    RETURN 'not_pending';
  END IF;

  IF _amount IS NULL
     OR abs(_amount - r.amount) > 0.005
     OR upper(COALESCE(_currency, '')) <> r.currency THEN
    UPDATE platform_fee_payments
       SET review_reason = format('amount/currency mismatch: expected %s %s, provider reported %s %s',
                                  r.amount, r.currency, COALESCE(_amount::text, '?'), upper(COALESCE(_currency, '?'))),
           provider_charge_id = COALESCE(provider_charge_id, _provider_charge_id),
           updated_at = now()
     WHERE payment_id = _payment_id;
    RETURN 'mismatch';
  END IF;

  UPDATE platform_fee_payments
     SET status = 'succeeded',
         paid_at = now(),
         provider_charge_id = COALESCE(_provider_charge_id, provider_charge_id),
         review_reason = NULL,
         updated_at = now()
   WHERE payment_id = _payment_id;

  PERFORM reevaluate_tenant_fee_standing(r.tenant_id);
  RETURN 'settled';
END;
$function$;

COMMENT ON FUNCTION public.settle_platform_fee_payment(uuid, uuid, text, text, numeric, text) IS
  'Issue #929: credit a pending fee payment from a verified provider event, then re-evaluate standing in the same transaction. Idempotent; amount/currency mismatch is flagged (review_reason) and never credited. Service role only.';

CREATE OR REPLACE FUNCTION public.reverse_platform_fee_payment_row(
  _payment_id uuid,
  _actor uuid,
  _reason text,
  _details jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r platform_fee_payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM platform_fee_payments p WHERE p.payment_id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF r.status = 'reversed' THEN
    RETURN 'duplicate';
  END IF;
  IF r.status <> 'succeeded' THEN
    RETURN 'not_settled';
  END IF;

  UPDATE platform_fee_payments
     SET status = 'reversed', reversed_at = now(), reversal_reason = _reason, updated_at = now()
   WHERE payment_id = _payment_id;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, payment_id, amount, currency, reason, details)
  VALUES (r.tenant_id, _actor, 'payment_reversed', r.payment_id, r.amount, r.currency, _reason, COALESCE(_details, '{}'::jsonb));
  -- No standing change: a reversal can only raise the balance, and blocking is
  -- the cron's job (grace, min balance, enforce mode). The next run re-derives.
  RETURN 'reversed';
END;
$function$;

-- Refund / chargeback from a provider: reverse the whole credited row.
-- Returns: reversed | duplicate | not_settled | not_found.
CREATE OR REPLACE FUNCTION public.reverse_platform_fee_payment_by_charge(
  _provider text,
  _provider_charge_id text,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _payment_id uuid;
BEGIN
  IF _provider_charge_id IS NULL THEN
    RETURN 'not_found';
  END IF;
  SELECT p.payment_id INTO _payment_id
  FROM platform_fee_payments p
  WHERE p.provider = _provider AND p.provider_charge_id = _provider_charge_id;
  IF _payment_id IS NULL THEN
    RETURN 'not_found';
  END IF;
  RETURN reverse_platform_fee_payment_row(
    _payment_id, NULL, _reason,
    jsonb_build_object('provider', _provider, 'provider_charge_id', _provider_charge_id)
  );
END;
$function$;

-- Super admin confirms a manual fee request: credit its payment row, close
-- the request, audit, re-evaluate standing — one transaction.
CREATE OR REPLACE FUNCTION public.confirm_platform_fee_request(
  _request_id uuid,
  _confirmed_by uuid
)
RETURNS TABLE (applied boolean, tenant_id uuid, payment_id uuid, standing text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  req platform_payment_requests%ROWTYPE;
  pay platform_fee_payments%ROWTYPE;
  _standing text;
BEGIN
  PERFORM assert_platform_fee_super_admin(_confirmed_by);

  SELECT * INTO req FROM platform_payment_requests ppr WHERE ppr.request_id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request not found' USING ERRCODE = 'P0002';
  END IF;
  IF req.request_type IS DISTINCT FROM 'fee' OR req.fee_payment_id IS NULL THEN
    RAISE EXCEPTION 'Not a platform fee payment request' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO pay FROM platform_fee_payments p WHERE p.payment_id = req.fee_payment_id FOR UPDATE;

  IF req.status = 'confirmed' THEN
    RETURN QUERY SELECT false, req.tenant_id, req.fee_payment_id, NULL::text;
    RETURN;
  END IF;
  IF req.status NOT IN ('pending', 'instructions_sent', 'payment_received') THEN
    RAISE EXCEPTION 'Payment request status % cannot be confirmed', req.status USING ERRCODE = 'P0001';
  END IF;
  -- Money seen (payment_received) is never lost to the TTL (3.3, isRequestOpen).
  IF req.status <> 'payment_received' AND req.expires_at <= now() THEN
    RAISE EXCEPTION 'Expired payments cannot be confirmed' USING ERRCODE = 'P0001';
  END IF;
  IF pay.status <> 'pending' THEN
    RAISE EXCEPTION 'Fee payment is % and cannot be confirmed', pay.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE platform_fee_payments
     SET status = 'succeeded', paid_at = now(), recorded_by = _confirmed_by,
         provider_reference = COALESCE(provider_reference, req.bank_reference),
         updated_at = now()
   WHERE platform_fee_payments.payment_id = pay.payment_id;

  UPDATE platform_payment_requests
     SET status = 'confirmed', confirmed_by = _confirmed_by, confirmed_at = now(), updated_at = now()
   WHERE platform_payment_requests.request_id = _request_id;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, payment_id, request_id, amount, currency, reason)
  VALUES (req.tenant_id, _confirmed_by, 'request_confirmed', pay.payment_id, _request_id, pay.amount, pay.currency, req.bank_reference);

  _standing := reevaluate_tenant_fee_standing(req.tenant_id);
  RETURN QUERY SELECT true, req.tenant_id, pay.payment_id, _standing;
END;
$function$;

-- Super admin records money received off-platform, or waives part of a
-- balance (design 4.4: waiver = payment row provider 'waiver', append-only).
CREATE OR REPLACE FUNCTION public.record_platform_fee_payment(
  _tenant_id uuid,
  _currency text,
  _amount numeric,
  _kind text,
  _actor uuid,
  _reason text,
  _reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _payment_id uuid;
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);
  IF _kind NOT IN ('offline', 'waiver') THEN
    RAISE EXCEPTION 'Unknown fee payment kind %', _kind USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'Amount must be positive with at most 2 decimals' USING ERRCODE = '22023';
  END IF;
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be an upper-case ISO code' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = _tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO platform_fee_payments (tenant_id, currency, amount, provider, provider_reference, status, paid_at, recorded_by, notes)
  VALUES (_tenant_id, _currency, _amount, CASE WHEN _kind = 'waiver' THEN 'waiver' ELSE 'manual' END,
          NULLIF(btrim(COALESCE(_reference, '')), ''), 'succeeded', now(), _actor, btrim(_reason))
  RETURNING payment_id INTO _payment_id;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, payment_id, amount, currency, reason, details)
  VALUES (_tenant_id, _actor, CASE WHEN _kind = 'waiver' THEN 'waived' ELSE 'offline_recorded' END,
          _payment_id, _amount, _currency, btrim(_reason),
          jsonb_build_object('reference', NULLIF(btrim(COALESCE(_reference, '')), '')));

  PERFORM reevaluate_tenant_fee_standing(_tenant_id);
  RETURN _payment_id;
END;
$function$;

-- Super admin adjusts DOWN a credit (e.g. a bounced transfer recorded too
-- early): reverses one succeeded payment row, with a reason.
CREATE OR REPLACE FUNCTION public.admin_reverse_platform_fee_payment(
  _payment_id uuid,
  _actor uuid,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  RETURN reverse_platform_fee_payment_row(_payment_id, _actor, btrim(_reason), '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_fee_exemption(
  _tenant_id uuid,
  _exempt boolean,
  _actor uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);
  IF _exempt IS NULL THEN
    RAISE EXCEPTION 'exempt must be true or false' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = _tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO tenant_fee_standing (tenant_id, state, enforcement_exempt, exempt_reason, exempt_set_by, exempt_set_at, updated_at)
  VALUES (_tenant_id, 'ok', _exempt, btrim(_reason), _actor, _now, _now)
  ON CONFLICT (tenant_id) DO UPDATE SET
    enforcement_exempt = EXCLUDED.enforcement_exempt,
    exempt_reason = EXCLUDED.exempt_reason,
    exempt_set_by = EXCLUDED.exempt_set_by,
    exempt_set_at = EXCLUDED.exempt_set_at,
    -- Exempting a blocked tenant lifts the block (it stays overdue for notices).
    state = CASE WHEN EXCLUDED.enforcement_exempt AND tenant_fee_standing.state = 'blocked'
                 THEN 'overdue' ELSE tenant_fee_standing.state END,
    blocked_at = CASE WHEN EXCLUDED.enforcement_exempt THEN NULL ELSE tenant_fee_standing.blocked_at END,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, reason)
  VALUES (_tenant_id, _actor, CASE WHEN _exempt THEN 'exemption_set' ELSE 'exemption_cleared' END, btrim(_reason));
END;
$function$;

-- ─── 6. A closed fee request cancels its pending payment row ───────────────

CREATE OR REPLACE FUNCTION public.cancel_fee_payment_on_request_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE platform_fee_payments
     SET status = 'canceled', updated_at = now()
   WHERE payment_id = NEW.fee_payment_id
     AND status = 'pending';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS after_fee_request_closed ON public.platform_payment_requests;
CREATE TRIGGER after_fee_request_closed
  AFTER UPDATE OF status ON public.platform_payment_requests
  FOR EACH ROW
  WHEN (NEW.fee_payment_id IS NOT NULL
        AND NEW.status IN ('rejected', 'expired')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cancel_fee_payment_on_request_close();

-- ─── Grants ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION
  public.assert_platform_fee_super_admin(uuid),
  public.settle_platform_fee_payment(uuid, uuid, text, text, numeric, text),
  public.reverse_platform_fee_payment_row(uuid, uuid, text, jsonb),
  public.reverse_platform_fee_payment_by_charge(text, text, text),
  public.confirm_platform_fee_request(uuid, uuid),
  public.record_platform_fee_payment(uuid, text, numeric, text, uuid, text, text),
  public.admin_reverse_platform_fee_payment(uuid, uuid, text),
  public.set_tenant_fee_exemption(uuid, boolean, uuid, text),
  public.cancel_fee_payment_on_request_close()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.settle_platform_fee_payment(uuid, uuid, text, text, numeric, text),
  public.reverse_platform_fee_payment_by_charge(text, text, text),
  public.confirm_platform_fee_request(uuid, uuid),
  public.record_platform_fee_payment(uuid, text, numeric, text, uuid, text, text),
  public.admin_reverse_platform_fee_payment(uuid, uuid, text),
  public.set_tenant_fee_exemption(uuid, boolean, uuid, text)
TO service_role;
