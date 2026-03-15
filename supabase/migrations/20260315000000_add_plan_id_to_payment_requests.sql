-- Add plan_id support to payment_requests table
-- Previously only product_id was supported (NOT NULL), preventing plans from using offline payments

-- Make product_id nullable (was NOT NULL)
ALTER TABLE payment_requests ALTER COLUMN product_id DROP NOT NULL;

-- Add plan_id column
ALTER TABLE payment_requests
  ADD COLUMN plan_id INTEGER REFERENCES plans(plan_id) ON DELETE CASCADE;

-- Ensure at least one of product_id or plan_id is set
ALTER TABLE payment_requests
  ADD CONSTRAINT payment_requests_product_or_plan
  CHECK ((product_id IS NOT NULL) OR (plan_id IS NOT NULL));

-- Index for plan_id lookups
CREATE INDEX idx_payment_requests_plan_id ON payment_requests(plan_id);
