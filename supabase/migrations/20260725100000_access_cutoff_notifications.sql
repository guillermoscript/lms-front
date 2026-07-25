-- Issue #517 — a send ledger for access-cutoff notifications.
--
-- #494 shipped exactly one email per cutoff, sent from the single 'schedule'
-- transition in reconcileAccessCutoff(). Nothing ran at T-7, T-1 or when the
-- cutoff actually took effect, and a failed send was swallowed with no retry.
--
-- This table is what makes a reminder ladder possible: it records which stage
-- of the ladder has already been delivered for a given cutoff, so the daily
-- enforce-plan-limits sweep can send whatever is due without ever repeating
-- itself. The unique constraint — not application logic — is what guarantees
-- that, since the sweep runs unattended and may overlap with an event-driven
-- reconcile.
--
-- Keyed on cutoff_at as well as tenant_id on purpose: a cutoff that is cleared
-- (usage back under limit) and later rescheduled is a genuinely new 14-day
-- deadline and deserves a fresh ladder, not silence because the old one was
-- already notified.
--
-- A row is written ONLY after at least one recipient send succeeded. A stage
-- whose sends all failed stays unrecorded, which is exactly what makes the
-- next daily sweep retry it.

CREATE TABLE IF NOT EXISTS public.access_cutoff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- The tenants.access_cutoff_at value this notification was about. Scopes the
  -- ladder to one specific deadline.
  cutoff_at timestamptz NOT NULL,
  -- 'scheduled' (immediate, at scheduling time) | 'reminder_7d' | 'reminder_1d'
  -- | 'enforced' (first sweep after the cutoff took effect).
  stage text NOT NULL CHECK (stage IN ('scheduled', 'reminder_7d', 'reminder_1d', 'enforced')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- How many admin addresses actually received it; > 0 by construction.
  recipient_count integer NOT NULL DEFAULT 0,
  CONSTRAINT access_cutoff_notifications_unique_stage UNIQUE (tenant_id, cutoff_at, stage)
);

CREATE INDEX IF NOT EXISTS idx_access_cutoff_notifications_tenant
  ON public.access_cutoff_notifications (tenant_id, cutoff_at);

-- Service-role only. Every writer is the cron sweep or a server-side
-- reconciler running with the service key; no authenticated user has any
-- reason to read or write the ledger, so RLS is enabled with no policy at all
-- (deny-by-default for anon/authenticated, service_role bypasses).
ALTER TABLE public.access_cutoff_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.access_cutoff_notifications IS
  'Issue #517: per-cutoff notification send ledger. One row per (tenant, cutoff_at, stage), written only on a successful send so failed stages are retried by the next daily sweep.';
