-- tenant_payment_wallets authorized on role alone, so a removed/banned admin
-- (status != 'active', role still 'admin') kept write access to the school's
-- payout wallet addresses. Scope to ACTIVE admins via is_admin_of(), like the
-- landing_pages policy.
DROP POLICY IF EXISTS tenant_payment_wallets_admin_all ON public.tenant_payment_wallets;

CREATE POLICY tenant_payment_wallets_admin_all
  ON public.tenant_payment_wallets
  FOR ALL
  TO authenticated
  USING (public.is_admin_of(tenant_id))
  WITH CHECK (public.is_admin_of(tenant_id));
