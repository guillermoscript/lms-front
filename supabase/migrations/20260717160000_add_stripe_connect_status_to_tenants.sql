-- Stripe Connect onboarding status flags (issue #439).
-- The account.updated webhook handler already wrote these columns, but they
-- were never created — the update failed silently. Adding them fixes that
-- and lets Settings→Payments reflect real onboarding state (Express accounts
-- use progressive KYC, so "has an account id" no longer implies "can charge").
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.stripe_charges_enabled IS 'Mirror of Stripe account charges_enabled — synced by account.updated webhook and on Settings load while onboarding is incomplete';
COMMENT ON COLUMN public.tenants.stripe_payouts_enabled IS 'Mirror of Stripe account payouts_enabled';
COMMENT ON COLUMN public.tenants.stripe_details_submitted IS 'Mirror of Stripe account details_submitted (hosted onboarding finished)';
