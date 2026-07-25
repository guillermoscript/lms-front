-- Rollback for 20260725110000_transaction_split_snapshot_backstop.sql (#512).
--
-- Removes the database backstop that fills transactions.school_percentage_snapshot.
-- After this runs, only app/api/payments/checkout/route.ts sets the snapshot, and
-- any other path that creates a platform-settled transaction (or a webhook that
-- sets payment_provider on an existing row) silently falls back to the tenant's
-- CURRENT split in computeOwedBalances — i.e. the #496 retroactive-repricing bug
-- returns, quietly and with no failure. Only run this to unblock an incident.
--
-- Snapshots already written by the trigger are left in place: they record the
-- split that was genuinely in effect, and clearing them would reintroduce the
-- fallback for those rows too.

DROP TRIGGER IF EXISTS before_transaction_split_snapshot ON transactions;
DROP FUNCTION IF EXISTS public.set_transaction_split_snapshot();
