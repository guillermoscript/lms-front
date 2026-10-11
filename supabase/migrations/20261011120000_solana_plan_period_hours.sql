-- Native Solana subscriptions store their billing period in whole hours on-chain.
-- Most school plans still use the existing day-based interval; this nullable
-- override allows accurately represented short Devnet test plans.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS solana_period_hours integer;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_solana_period_hours_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_solana_period_hours_check
  CHECK (
    solana_period_hours IS NULL
    OR (payment_provider = 'solana_subs' AND solana_period_hours > 0)
  );

COMMENT ON COLUMN public.plans.solana_period_hours IS
  'Optional native Solana subscription period in whole hours; NULL uses duration_in_days.';
