-- Manual rollback for 20260623120000_atomic_product_creation_wizard.sql
-- and 20260621120000_create_product_post_registration_steps.sql.
--
-- Supabase migrations are forward-only; this file is NOT auto-applied. Run it by
-- hand (psql / supabase db execute) to undo the wizard's schema additions.
-- Order matters: drop dependents before the table.

DROP TRIGGER IF EXISTS trigger_set_product_post_registration_steps_updated_at
  ON public.product_post_registration_steps;

DROP FUNCTION IF EXISTS public.set_product_post_registration_steps_updated_at();

DROP FUNCTION IF EXISTS public.save_product_creation_wizard(
  uuid, uuid, text, text, integer, jsonb, text, integer, jsonb, jsonb
);

-- Drops the table and all its rows + RLS policy (CASCADE clears the policy).
DROP TABLE IF EXISTS public.product_post_registration_steps CASCADE;
