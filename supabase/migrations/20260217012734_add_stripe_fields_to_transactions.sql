-- Add Stripe payment intent ID tracking and refunded status to transactions

-- Add stripe_payment_intent_id column for tracking refunds
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

-- Create index for fast lookups by payment intent ID
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent
ON transactions(stripe_payment_intent_id);

-- Add missing enum values to transaction_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'archived' AND enumtypid = 'public.transaction_status'::regtype) THEN
    ALTER TYPE public.transaction_status ADD VALUE 'archived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'canceled' AND enumtypid = 'public.transaction_status'::regtype) THEN
    ALTER TYPE public.transaction_status ADD VALUE 'canceled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'refunded' AND enumtypid = 'public.transaction_status'::regtype) THEN
    ALTER TYPE public.transaction_status ADD VALUE 'refunded';
  END IF;
END $$;

-- Add comment explaining the new column
COMMENT ON COLUMN transactions.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for tracking refunds and correlating webhook events';
