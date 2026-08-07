-- Issue #615 — separate the super admin's rejection reason from the school's own note.
--
-- `rejectManualPayment` wrote its reason into `platform_payment_requests.notes`,
-- which is the column `requestManualPlanUpgrade` uses for the note the SCHOOL
-- attaches when it files the request. Rejecting therefore destroyed the school's
-- side of the record, on the one row a money reconciliation reads.
--
-- `admin_notes` is also the column the reject dialog's placeholder has always
-- claimed to write to; it just never existed. Now it does.
--
-- Additive and nullable: no backfill, and no RLS change — the platform billing
-- page reads this table through the service-role client, and the tenant-facing
-- policies select the whole row either way.
ALTER TABLE platform_payment_requests
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

COMMENT ON COLUMN platform_payment_requests.admin_notes IS
  'Super-admin-authored note about this request (currently the rejection reason). Distinct from `notes`, which belongs to the requesting school.';
