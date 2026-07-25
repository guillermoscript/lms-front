-- Rollback for 20260725180000_transactions_insert_lockdown.sql (issue #538).
--
-- NOT APPLIED BY DEFAULT. Running this restores the INSERT grant and the #528
-- policy as 20260725170000_transactions_column_hardening.sql left them — which
-- REOPENS #538: an authenticated student regains the ability to POST a pending
-- `solana` transaction carrying its own settlement claim (settlement_base: 1 on
-- a $49 product), pay a single lamport, and have the verify endpoint confirm it
-- and grant the entitlement.
--
-- It also only makes sense together with reverting the two route changes in the
-- same commit: with the grant back but the inserts still on the admin client,
-- nothing uses the grant and the hole is open for no reason.
--
-- Only run it if the revoked grant has broken a legitimate write path and the fix
-- has to be re-cut.

BEGIN;

GRANT INSERT ON TABLE public.transactions TO authenticated, anon;

DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND status = 'pending'
  );

COMMENT ON COLUMN public.transactions.settlement_base IS
  'Locked integer base amount the wallet must pay: lamports (sol) or token base units (usdc). Set once at checkout; /tx and /verify read this, never re-quote.';

COMMIT;
