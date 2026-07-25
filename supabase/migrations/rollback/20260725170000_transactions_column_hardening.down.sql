-- Rollback for 20260725170000_transactions_column_hardening.sql (issue #528).
--
-- NOT APPLIED BY DEFAULT. Running this restores the policies and grants exactly
-- as 20260313025318_rls_transactions.sql left them — which means it REOPENS both
-- impacts described in #528: an authenticated student regains the ability to
-- self-insert a 'successful' transaction (free course access via the
-- after_transaction_insert trigger) and to fabricate a platform-settled sale that
-- inflates getPayoutsOwed(). Only run it if the column grant has broken a
-- legitimate write path and the fix has to be re-cut.

BEGIN;

DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());

-- Drop the column-level grants before restoring the table-level one, so no
-- narrower privilege is left dangling behind the broad grant.
REVOKE UPDATE (status, provider_subscription_id, stripe_payment_intent_id)
  ON TABLE public.transactions FROM authenticated;

GRANT UPDATE ON TABLE public.transactions TO authenticated;

DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id())
  WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());

COMMIT;
