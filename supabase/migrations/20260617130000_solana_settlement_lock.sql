-- Locked Solana settlement for USD-denominated native-SOL payments (issue #280).
--
-- Products/plans are priced in USD. When a student elects to pay in native SOL,
-- the USD price is converted to a SOL amount AT CHECKOUT using the live SOL/USD
-- rate, and that amount is LOCKED here. The rate moves between checkout and
-- on-chain confirmation, so /tx (build) and /verify (confirm) must use this
-- stored amount — never re-quote, or verification would compare against the
-- wrong number and reject a valid payment.
--
-- USDC payments are a 1:1 USD stablecoin: settlement_base = round(price*1e6),
-- no rate, but we still store the lock so /tx and /verify share one source of
-- truth and the per-checkout currency choice (sol vs usdc) is honored.
--
-- LOCAL-ONLY until the operator applies the #280/#334 migration set to cloud.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS settlement_currency TEXT,        -- 'sol' | 'usdc'
  ADD COLUMN IF NOT EXISTS settlement_base     BIGINT,      -- locked base units (lamports or USDC micro)
  ADD COLUMN IF NOT EXISTS settlement_mint     TEXT,        -- SPL mint for USDC; NULL for native SOL
  ADD COLUMN IF NOT EXISTS settlement_sol_usd  NUMERIC(20,8); -- locked SOL/USD rate (audit); NULL for USDC

COMMENT ON COLUMN public.transactions.settlement_currency IS
  'Solana settlement token chosen at checkout: sol (native) or usdc.';
COMMENT ON COLUMN public.transactions.settlement_base IS
  'Locked integer base amount the wallet must pay: lamports (sol) or token base units (usdc). Set once at checkout; /tx and /verify read this, never re-quote.';
COMMENT ON COLUMN public.transactions.settlement_mint IS
  'SPL mint address for the settlement token; NULL for native SOL.';
COMMENT ON COLUMN public.transactions.settlement_sol_usd IS
  'SOL/USD rate locked at checkout (audit trail); NULL for USDC.';
