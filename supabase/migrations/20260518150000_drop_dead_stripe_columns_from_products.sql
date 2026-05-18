-- Drop dead stripe_product_id and stripe_price_id columns from products.
--
-- These were the original Stripe-specific columns added in
-- 20260201145244_admin_dashboard_setup.sql. Migration
-- 20260207190849_add_payment_provider_to_products.sql replaced them with
-- the generic provider_product_id / provider_price_id columns that support
-- Stripe, PayPal, manual, and any future provider.
--
-- All rows have NULL values. No application code references these columns
-- on the products table (the identically-named columns on the plans table
-- are separate and remain untouched).

ALTER TABLE public.products
  DROP COLUMN IF EXISTS stripe_product_id,
  DROP COLUMN IF EXISTS stripe_price_id;
