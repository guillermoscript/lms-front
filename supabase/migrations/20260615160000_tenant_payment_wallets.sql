-- Generic per-tenant, per-provider receiving wallet / credentials (issue #280).
--
-- Each school configures where it receives funds for a given provider. For
-- Solana this is the school's base58 receiving wallet; the platform fee goes to
-- a separate platform wallet (env SOLANA_PLATFORM_WALLET) and the split percent
-- comes from revenue_splits. Kept generic (provider + address + jsonb creds) so
-- other providers / future per-tenant credentials fit the same table.
--
-- `credentials` is reserved for future encrypted secrets (e.g. per-tenant API
-- keys); it is NOT used for Solana, where only the public wallet address is
-- needed server-side. Do not store plaintext secrets here.

CREATE TABLE IF NOT EXISTS public.tenant_payment_wallets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  wallet_address text,
  credentials    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_payment_wallets_provider_unique UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_wallets_tenant
  ON public.tenant_payment_wallets (tenant_id);

ALTER TABLE public.tenant_payment_wallets ENABLE ROW LEVEL SECURITY;

-- Tenant admins manage their own tenant's wallets. Membership + admin role are
-- read from tenant_users (authoritative for roles in this codebase).
CREATE POLICY tenant_payment_wallets_admin_all
  ON public.tenant_payment_wallets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_payment_wallets.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_payment_wallets.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
    )
  );

-- The checkout / verify routes read wallets via the service-role client, which
-- bypasses RLS — so no separate public read policy is needed (and provider
-- credentials must never be exposed to anon/authenticated reads).
