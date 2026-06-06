-- Add 'past_due' to the subscription_status enum.
--
-- The Stripe Connect webhook (app/api/stripe/webhook/route.ts, invoice.payment_failed)
-- updates subscriptions.subscription_status to 'past_due' so access continues during
-- Stripe's dunning/retry window. But the enum only had
-- (active, canceled, expired, renewed), so every such update failed with
-- "invalid input value for enum subscription_status: 'past_due'". The error was
-- swallowed (the update's error wasn't checked), so failed recurring payments were
-- never reflected — the subscription stayed 'active'.
--
-- 'past_due' is intentionally NOT in the revoke set of handle_subscription_status_change()
-- (which only revokes entitlements on 'canceled' / 'expired'), so marking a sub past_due
-- keeps the student's access alive during retries, as intended.

alter type subscription_status add value if not exists 'past_due';
