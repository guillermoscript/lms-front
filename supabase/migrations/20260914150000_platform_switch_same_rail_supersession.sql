-- #744 — PayPal school → platform billing: same-rail supersession.
--
-- `platform_subscription_switches` shipped with CHECK (source_payment_provider
-- <> target_payment_provider), because a switch only ever moved a school from
-- one rail to another. PayPal Billing Plans have no in-place price swap
-- (`supportsPlanChange: false`), so the only way a PayPal school changes plan
-- is a new PayPal subscription promoted through this same switch machinery,
-- with the old one cancelled after promotion — a switch whose source and target
-- provider are equal.
--
-- The rule moves into `beginPlatformSubscriptionSwitch`
-- (`supersedesOnSameRail`): Stripe and Lemon Squeezy still change plan in place
-- and self-managed rails still renew, so neither ever records a same-provider
-- switch. Nothing else relies on the providers differing:
-- `promote_platform_subscription_switch` matches the current row against the
-- source by subscription id AND provider subscription id, and the unique
-- indexes key on (provider, provider_subscription_id), which differ between the
-- old and the new PayPal subscription.
--
-- The constraint was declared without a name, so it is located by definition
-- rather than by the generated name.

DO $$
DECLARE
  _name text;
BEGIN
  SELECT conname INTO _name
  FROM pg_constraint
  WHERE conrelid = 'public.platform_subscription_switches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source_payment_provider <> target_payment_provider%';

  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.platform_subscription_switches DROP CONSTRAINT %I', _name);
  END IF;
END
$$;
