-- Rollback for 20260725110000_transaction_split_snapshot_backstop.sql (#512).
--
-- Removes the database ownership of transactions.school_percentage_snapshot.
-- After this runs:
--
--   1. Only app/api/payments/checkout/route.ts sets the snapshot. Any other path
--      that creates a platform-settled transaction — or a webhook that sets
--      payment_provider on an existing row — silently falls back to the tenant's
--      CURRENT split in computeOwedBalances, i.e. the #496 retroactive-repricing
--      bug returns, quietly and with no failure.
--   2. The column becomes client-writable again. `transactions` grants ALL to
--      `authenticated` and its RLS policies restrict rows, not columns, so a
--      student can set school_percentage_snapshot on their own transaction and
--      inflate what the platform believes it owes their school.
--
-- (2) is the reason to treat this as an incident-only lever rather than a clean
-- revert. If you run it, watch /platform/payouts for balances that move without a
-- corresponding sale.
--
-- Snapshots already written by the triggers are left in place: they record the
-- split that was genuinely in effect, and clearing them would reintroduce the
-- fallback for those rows too.

DROP TRIGGER IF EXISTS before_transaction_split_snapshot_insert ON transactions;
DROP TRIGGER IF EXISTS before_transaction_split_snapshot_update ON transactions;
-- Name used by the first revision of the up-migration; harmless if absent.
DROP TRIGGER IF EXISTS before_transaction_split_snapshot ON transactions;
DROP FUNCTION IF EXISTS public.set_transaction_split_snapshot();
