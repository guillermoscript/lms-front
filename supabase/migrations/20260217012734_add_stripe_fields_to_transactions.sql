-- Add Stripe payment intent ID tracking and refunded status to transactions

-- Add stripe_payment_intent_id column for tracking refunds
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

-- Create index for fast lookups by payment intent ID
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent
ON transactions(stripe_payment_intent_id);

-- Update status constraint to include 'refunded'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
CHECK (status IN ('pending', 'successful', 'failed', 'archived', 'canceled', 'refunded'));

-- Add comment explaining the new column
COMMENT ON COLUMN transactions.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for tracking refunds and correlating webhook events';
