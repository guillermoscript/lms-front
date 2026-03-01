-- Add payment_provider column to products table
-- This allows products to support different payment methods (stripe, manual, paypal, etc.)

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe';

-- Add constraint to ensure valid payment providers
ALTER TABLE products
ADD CONSTRAINT products_payment_provider_check 
CHECK (payment_provider IN ('stripe', 'manual', 'paypal'));

-- Add comment for documentation
COMMENT ON COLUMN products.payment_provider IS 'Payment method for this product: stripe, manual (offline), or paypal';

-- Update existing products to use stripe by default
UPDATE products 
SET payment_provider = 'stripe' 
WHERE payment_provider IS NULL;

-- Add payment_provider to plans table for consistency
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe';

ALTER TABLE plans
ADD CONSTRAINT plans_payment_provider_check 
CHECK (payment_provider IN ('stripe', 'manual', 'paypal'));

COMMENT ON COLUMN plans.payment_provider IS 'Payment method for this plan: stripe, manual (offline), or paypal';

UPDATE plans 
SET payment_provider = 'stripe' 
WHERE payment_provider IS NULL;
