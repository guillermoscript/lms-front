-- Rollback for 20261009100000_platform_fee_ledger_929.sql (issue #929).
--
-- Deploy the app WITHOUT any code that reads or writes the fee ledger first
-- (nothing in the foundation PR does; later slices will). Dropping the tables
-- discards recorded fee payments, statements and standing; dropping the
-- transactions fx_* / usd_amount columns discards the insert-time USD snapshot
-- of hyperinflation-currency sales, which cannot be re-derived later at the
-- same rate.
--
-- The request_type CHECK is restored to its previous list. If any
-- request_type = 'fee' rows exist, the VALIDATE fails and the whole rollback
-- aborts: settle or delete those requests first (deliberately not done here).
--
-- Reverse order of the up migration; triggers before the columns they read.

DROP FUNCTION IF EXISTS public.reevaluate_tenant_fee_standing(uuid);
DROP FUNCTION IF EXISTS public.platform_fee_ledger(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.is_tenant_sales_blocked(uuid);

ALTER TABLE public.platform_payment_requests
  DROP CONSTRAINT IF EXISTS platform_payment_requests_request_type_check;
ALTER TABLE public.platform_payment_requests
  ADD CONSTRAINT platform_payment_requests_request_type_check
  CHECK (request_type IN ('upgrade', 'downgrade', 'renewal')) NOT VALID;
ALTER TABLE public.platform_payment_requests
  VALIDATE CONSTRAINT platform_payment_requests_request_type_check;

DROP TABLE IF EXISTS public.tenant_fee_standing;
DROP TABLE IF EXISTS public.platform_fee_payments;
DROP TABLE IF EXISTS public.platform_fee_statements;

DROP TRIGGER IF EXISTS before_transaction_fx_snapshot_update ON public.transactions;
DROP FUNCTION IF EXISTS public.freeze_transaction_fx_snapshot();
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_fx_snapshot_check;
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS usd_amount,
  DROP COLUMN IF EXISTS fx_rate_date,
  DROP COLUMN IF EXISTS fx_rate_source,
  DROP COLUMN IF EXISTS fx_rate_to_usd;
DROP TABLE IF EXISTS public.platform_fx_rates;

DROP TRIGGER IF EXISTS before_platform_fee_config_update ON public.platform_fee_config;
DROP FUNCTION IF EXISTS public.stamp_platform_fee_config_update();
DROP TABLE IF EXISTS public.platform_fee_config;
