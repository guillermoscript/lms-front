-- Enable pg_cron extension (must be done by superuser / dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to handle manual subscription expiry
CREATE OR REPLACE FUNCTION handle_manual_subscription_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Step 1: Mark expired manual subscriptions as past_due with 7-day grace period
  FOR rec IN
    SELECT ps.tenant_id, ps.current_period_end
    FROM platform_subscriptions ps
    WHERE ps.payment_method = 'manual_transfer'
      AND ps.status = 'active'
      AND ps.current_period_end < now()
      AND ps.cancel_at_period_end = false
  LOOP
    -- Set subscription to past_due with grace period
    UPDATE platform_subscriptions
    SET status = 'past_due',
        grace_period_end = rec.current_period_end + interval '7 days',
        updated_at = now()
    WHERE tenant_id = rec.tenant_id;

    -- Update tenant billing status
    UPDATE tenants
    SET billing_status = 'past_due',
        updated_at = now()
    WHERE id = rec.tenant_id;
  END LOOP;

  -- Step 2: Downgrade past_due subscriptions after grace period ends
  FOR rec IN
    SELECT ps.tenant_id
    FROM platform_subscriptions ps
    WHERE ps.payment_method = 'manual_transfer'
      AND ps.status = 'past_due'
      AND ps.grace_period_end IS NOT NULL
      AND ps.grace_period_end < now()
  LOOP
    -- Get the free plan ID
    DECLARE
      free_plan_id UUID;
    BEGIN
      SELECT plan_id INTO free_plan_id
      FROM platform_plans
      WHERE slug = 'free'
      LIMIT 1;

      -- Cancel the subscription
      UPDATE platform_subscriptions
      SET status = 'canceled',
          canceled_at = now(),
          updated_at = now()
      WHERE tenant_id = rec.tenant_id;

      -- Downgrade tenant to free plan
      UPDATE tenants
      SET plan = 'free',
          billing_status = 'free',
          billing_period_end = NULL,
          updated_at = now()
      WHERE id = rec.tenant_id;

      -- Reset revenue splits to free plan defaults (10% platform fee)
      UPDATE revenue_splits
      SET platform_percentage = 10,
          school_percentage = 90,
          updated_at = now()
      WHERE tenant_id = rec.tenant_id;
    END;
  END LOOP;

  -- Step 3: Handle subscriptions set to cancel at period end
  FOR rec IN
    SELECT ps.tenant_id
    FROM platform_subscriptions ps
    WHERE ps.cancel_at_period_end = true
      AND ps.status = 'active'
      AND ps.current_period_end < now()
  LOOP
    DECLARE
      free_plan_id UUID;
    BEGIN
      SELECT plan_id INTO free_plan_id
      FROM platform_plans
      WHERE slug = 'free'
      LIMIT 1;

      UPDATE platform_subscriptions
      SET status = 'canceled',
          canceled_at = now(),
          updated_at = now()
      WHERE tenant_id = rec.tenant_id;

      UPDATE tenants
      SET plan = 'free',
          billing_status = 'free',
          billing_period_end = NULL,
          updated_at = now()
      WHERE id = rec.tenant_id;

      UPDATE revenue_splits
      SET platform_percentage = 10,
          school_percentage = 90,
          updated_at = now()
      WHERE tenant_id = rec.tenant_id;
    END;
  END LOOP;
END;
$$;

-- Schedule the cron job to run daily at 2:00 AM UTC
SELECT cron.schedule(
  'expire-manual-subscriptions',
  '0 2 * * *',
  $$SELECT handle_manual_subscription_expiry()$$
);
