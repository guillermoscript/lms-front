-- Unified webhook ingestion log: idempotency + audit for ALL payment providers.
--
-- Part of the provider-agnostic payments work (issue #280, Phase 3). Every
-- inbound provider webhook is recorded here BEFORE processing, keyed by
-- (provider, provider_event_id). A row whose processed_at is set has already
-- been handled, so redelivered events are no-ops. The raw payload is kept for
-- audit / replay.
--
-- The unified route app/api/payments/webhook/[provider] writes here via the
-- service-role admin client (bypasses RLS). RLS is enabled with NO policies so
-- no tenant/anon role can read provider payloads.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  event_type        text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  error             text,
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

-- Fast scan for un-processed / failed events (replay, monitoring).
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON public.webhook_events (received_at)
  WHERE processed_at IS NULL;

-- Service-role only: enable RLS, define no policies.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Harden the subscription webhook-lookup key. The previous migration
-- (20260615120000) added a NON-unique index on subscriptions.provider_subscription_id.
-- The shared dispatcher updates by (provider_subscription_id, payment_provider),
-- so that pair MUST be unique — otherwise one provider event could mutate
-- several subscription rows. Provider subscription ids are unique per provider,
-- so this constraint is always satisfiable. (Cross-tenant isolation relies on
-- each provider account belonging to one tenant; per-tenant provider credentials
-- remain a separate, larger effort — see the spike doc.)
DROP INDEX IF EXISTS public.idx_subscriptions_provider_subscription_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_unique
  ON public.subscriptions (provider_subscription_id, payment_provider)
  WHERE provider_subscription_id IS NOT NULL;
