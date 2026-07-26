-- Subscription cancel-state contract — issue #545 (EPIC #540 §2.2), bug 1.
--
-- `subscriptions.cancel_at` shipped as
--
--     cancel_at | timestamptz | NOT NULL | DEFAULT timezone('utc', now())
--
-- and NO writer sets it at creation (handle_new_subscription and
-- change_subscription_plan both omit it), so every row was born with a cancel
-- date permanently in the past. The Solana auto-pull crank
-- (lib/payments/solana-pull-decision.ts) read that column as "is this row
-- scheduled to cancel?", so the first crank run after a period rolled took the
-- cancel branch: subscription_status → 'canceled', entitlements expired by
-- handle_subscription_status_change, no pull submitted. Native `solana_subs`
-- recurring billing could therefore never renew — the student lost access at
-- period end, the school was never paid for period 2 onward, and the on-chain
-- delegation stayed live.
--
-- The contract from here on:
--
--   cancel_at_period_end  NOT NULL DEFAULT false. The ONLY signal that a cancel
--                         is scheduled. Every decision (crank, cron, UI) reads
--                         this and nothing else.
--   cancel_at             NULL when no cancel is scheduled; otherwise the
--                         instant the subscription terminates. Informational —
--                         a date, never a signal.
--
-- The CHECK below makes the pair inseparable: a stale cancel date cannot be
-- left behind by clearing the flag, and a date cannot be written without
-- scheduling the cancel. That is exactly the invariant the old column default
-- violated on every INSERT.
--
-- `canceled_at` and `ended_at` carried the same `DEFAULT now()` lie — a freshly
-- created subscription was born "canceled at now, ended at now". Both are
-- already worked around by writers that explicitly send NULL
-- (handle_new_subscription's ON CONFLICT, change_subscription_plan); drop the
-- defaults so the workaround is no longer needed, and repair live rows.
--
-- No real users hold subscriptions (#545: "prefer the clean schema change over
-- a compatible one"), so this changes the column contract outright rather than
-- layering a compatibility shim on top of it.

-- ── 1. cancel_at becomes nullable with no default ───────────────────────────
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at DROP DEFAULT;
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at DROP NOT NULL;

-- ── 2. cancel_at_period_end becomes the authoritative, always-present flag ──
UPDATE public.subscriptions SET cancel_at_period_end = false WHERE cancel_at_period_end IS NULL;
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at_period_end SET DEFAULT false;
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at_period_end SET NOT NULL;

-- ── 3. Repair every row born with the bogus defaults ────────────────────────
-- A row that is not scheduled to cancel must not carry a cancel date. A row
-- that IS scheduled cancels at its period end, which is what both cancel
-- actions write today.
UPDATE public.subscriptions
   SET cancel_at = CASE
         WHEN cancel_at_period_end THEN COALESCE(current_period_end, end_date, cancel_at)
         ELSE NULL
       END;

-- `canceled_at` / `ended_at` only mean something once the subscription actually
-- ended. Clear the default-injected values on every still-live row.
ALTER TABLE public.subscriptions ALTER COLUMN canceled_at DROP DEFAULT;
ALTER TABLE public.subscriptions ALTER COLUMN ended_at DROP DEFAULT;

UPDATE public.subscriptions
   SET canceled_at = NULL
 WHERE canceled_at IS NOT NULL
   AND NOT cancel_at_period_end
   AND subscription_status NOT IN ('canceled', 'expired');

UPDATE public.subscriptions
   SET ended_at = NULL
 WHERE ended_at IS NOT NULL
   AND subscription_status NOT IN ('canceled', 'expired');

-- ── 4. Pin the invariant ────────────────────────────────────────────────────
-- Validated (not NOT VALID): step 3 guarantees every existing row satisfies it,
-- and a silently-unenforced constraint would reproduce this whole bug class.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subscriptions_cancel_at_requires_schedule'
       AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_cancel_at_requires_schedule
      CHECK (cancel_at IS NULL OR cancel_at_period_end);
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.cancel_at IS
  'When this subscription terminates, or NULL when no cancel is scheduled. Informational only — cancel_at_period_end is the signal (issue #545). Enforced by subscriptions_cancel_at_requires_schedule.';
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS
  'The single source of truth for "a cancel is scheduled". Read by the Solana auto-pull crank, the expiry crons and the billing UI (issue #545).';
