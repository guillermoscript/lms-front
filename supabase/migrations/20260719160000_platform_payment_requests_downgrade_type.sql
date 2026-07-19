-- Allow 'downgrade' as a platform payment request type.
--
-- Part of #465 (in-app school plan change). The manual (bank-transfer) flow
-- previously hardcoded request_type = 'upgrade' regardless of tier, so manual
-- downgrades were indistinguishable from upgrades. The request-creation action
-- now derives a real 'upgrade' | 'downgrade' via classifyPlanChange(), which
-- needs the CHECK constraint to permit 'downgrade'.
--
-- The original constraint was added in 20260221010000_billing_proof_upload.sql
-- as: CHECK (request_type IN ('upgrade', 'renewal')).

ALTER TABLE platform_payment_requests
  DROP CONSTRAINT IF EXISTS platform_payment_requests_request_type_check;

ALTER TABLE platform_payment_requests
  ADD CONSTRAINT platform_payment_requests_request_type_check
  CHECK (request_type IN ('upgrade', 'downgrade', 'renewal'));
