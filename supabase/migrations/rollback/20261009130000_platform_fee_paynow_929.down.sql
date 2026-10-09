-- Rollback for 20261009130000_platform_fee_paynow_929.sql (issue #929).
--
-- Deploy app code that no longer calls /api/billing/fees/checkout or the
-- ledger RPCs first.
--
-- DATA LOSS, deliberate and bounded:
--   * fee requests (platform_payment_requests.request_type = 'fee') are
--     deleted, because plan_id becomes NOT NULL again; their payment rows stay.
--   * 'reversed' payments become 'canceled' (the old CHECK has no 'reversed';
--     both count as not paid, so the balance is unchanged).
--   * the audit log and the exemption columns are dropped. Export
--     platform_fee_audit_log first if it must be kept.

DROP TRIGGER IF EXISTS after_fee_request_closed ON public.platform_payment_requests;
DROP FUNCTION IF EXISTS public.cancel_fee_payment_on_request_close();

DROP FUNCTION IF EXISTS public.set_tenant_fee_exemption(uuid, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.admin_reverse_platform_fee_payment(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.record_platform_fee_payment(uuid, text, numeric, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.confirm_platform_fee_request(uuid, uuid);
DROP FUNCTION IF EXISTS public.reverse_platform_fee_payment_by_charge(text, text, text);
DROP FUNCTION IF EXISTS public.reverse_platform_fee_payment_row(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.settle_platform_fee_payment(uuid, uuid, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.assert_platform_fee_super_admin(uuid);

DROP TABLE IF EXISTS public.platform_fee_audit_log;

-- is_tenant_sales_blocked() as in 20261009100000 (no exemption).
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
  );
$function$;

ALTER TABLE public.tenant_fee_standing DROP CONSTRAINT IF EXISTS tenant_fee_standing_exempt_not_blocked;
ALTER TABLE public.tenant_fee_standing
  DROP COLUMN IF EXISTS exempt_set_at,
  DROP COLUMN IF EXISTS exempt_set_by,
  DROP COLUMN IF EXISTS exempt_reason,
  DROP COLUMN IF EXISTS enforcement_exempt;

ALTER TABLE public.platform_fee_payments DROP CONSTRAINT IF EXISTS platform_fee_payments_reversal_check;
UPDATE public.platform_fee_payments SET status = 'canceled' WHERE status = 'reversed';
ALTER TABLE public.platform_fee_payments DROP CONSTRAINT IF EXISTS platform_fee_payments_status_check;
ALTER TABLE public.platform_fee_payments
  ADD CONSTRAINT platform_fee_payments_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled'));
ALTER TABLE public.platform_fee_payments
  DROP COLUMN IF EXISTS requested_by,
  DROP COLUMN IF EXISTS review_reason,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversed_at;

DELETE FROM public.platform_payment_requests WHERE fee_payment_id IS NOT NULL OR request_type = 'fee';
DROP INDEX IF EXISTS public.platform_payment_requests_fee_payment_unique;
ALTER TABLE public.platform_payment_requests DROP CONSTRAINT IF EXISTS platform_payment_requests_plan_or_fee_check;
ALTER TABLE public.platform_payment_requests DROP COLUMN IF EXISTS fee_payment_id;
ALTER TABLE public.platform_payment_requests ALTER COLUMN plan_id SET NOT NULL;
