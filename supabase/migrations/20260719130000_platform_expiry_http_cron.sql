-- Issue #462: move manual platform-subscription expiry from pg_cron to the
-- HTTP cron route /api/cron/expire-platform-subscriptions. The route adds a
-- pending-renewal pause, admin reminder/downgrade emails, and a revenue split
-- read from the free plan row — none of which the SQL function could do.

-- Tracks the one-time pre-expiry renewal reminder per billing period.
-- confirmManualPayment resets it to NULL on renewal so the next cycle reminds again.
ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;

-- Unschedule the pg_cron job so it can't race the HTTP cron. Guarded: pg_cron
-- is absent on some local/self-hosted stacks, and the job may already be gone.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-manual-subscriptions') THEN
    PERFORM cron.unschedule('expire-manual-subscriptions');
  END IF;
END $$;

DROP FUNCTION IF EXISTS handle_manual_subscription_expiry();
