-- Rollback for 20261009140000_platform_fee_bank_details_929.sql (issue #929).
--
-- Deploy app code that no longer reads platform_bank_accounts or calls the
-- bank account functions first.
--
-- DATA LOSS, deliberate and bounded:
--   * platform_bank_accounts is dropped (export it first if it must be kept).
--   * the platform-scoped bank_account_* audit rows are deleted, because
--     tenant_id becomes NOT NULL again and the old action CHECK lacks them.

DROP FUNCTION IF EXISTS public.set_platform_bank_account_active(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean);

DROP TABLE IF EXISTS public.platform_bank_accounts;

DELETE FROM public.platform_fee_audit_log WHERE action LIKE 'bank\_account\_%' OR tenant_id IS NULL;

ALTER TABLE public.platform_fee_audit_log DROP CONSTRAINT IF EXISTS platform_fee_audit_log_tenant_scope;
ALTER TABLE public.platform_fee_audit_log ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.platform_fee_audit_log DROP CONSTRAINT IF EXISTS platform_fee_audit_log_action_check;
ALTER TABLE public.platform_fee_audit_log ADD CONSTRAINT platform_fee_audit_log_action_check CHECK (action IN (
  'request_confirmed', 'offline_recorded', 'waived', 'payment_reversed',
  'exemption_set', 'exemption_cleared'
));
