-- #496: revenue_splits.school_percentage isn't time-sliced today — the
-- payouts-owed computation applies the tenant's CURRENT split to the
-- entire all-time sum of platform-settled transactions, so any plan change
-- (which rewrites revenue_splits) silently reprices every historical
-- transaction, not just new ones.
--
-- Snapshot the split percentage in effect at the moment each transaction is
-- created (app/api/payments/checkout/route.ts), so a later plan change only
-- affects future transactions. NULL for transactions created before this
-- column existed; lib/payments/payouts-owed.ts falls back to the tenant's
-- current split for those, matching the pre-#496 behavior for old data.

ALTER TABLE transactions
  ADD COLUMN school_percentage_snapshot numeric;

COMMENT ON COLUMN transactions.school_percentage_snapshot IS
  'revenue_splits.school_percentage in effect for this tenant when this transaction was created. NULL for transactions predating this column (#496) — payout computation falls back to the tenant''s current split for those.';
