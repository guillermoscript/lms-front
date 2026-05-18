-- Add provider_product_id and provider_price_id to products.
--
-- Migration 20260207190849 added the payment_provider column but never added
-- the two ID columns the createProduct / updateProduct server actions write.
-- Without them, any INSERT or UPDATE that includes these fields returns
-- PGRST204 ("column does not exist"), making product creation from the admin
-- form completely broken.
--
-- These replace the old stripe_product_id / stripe_price_id columns (dropped
-- in 20260518150000) with a provider-agnostic pair that works for Stripe,
-- PayPal, and manual (where they hold a local mock ID).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS provider_product_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_price_id   TEXT;
