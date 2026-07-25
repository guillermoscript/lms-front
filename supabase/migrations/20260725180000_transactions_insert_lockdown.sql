-- Issue #538 — an untrusted caller may not open a transaction at all.
--
-- #528 (20260725170000) established the invariant "an untrusted caller may open
-- a transaction, but may not declare it paid": the INSERT policy pins
-- `status = 'pending'`, and table-level UPDATE is revoked in favour of a
-- three-column grant. It deliberately said nothing about WHAT a pending row
-- claims it is owed, and the Solana settlement columns are exactly that:
--
--   settlement_currency  text            -- 'sol' | 'usdc'
--   settlement_base      bigint          -- lamports / USDC base units
--   settlement_mint      text            -- SPL mint; NULL = native SOL
--   settlement_sol_usd   numeric(20,8)   -- locked quote (audit)
--
-- The on-chain payment is verified against the row's OWN settlement_base
-- (lib/payments/solana-reconcile.ts:104 → verifySplitTransfer({ totalBase })),
-- and the Solana Pay transaction handed to the wallet is built from it too
-- (app/api/payments/solana/tx/route.ts:119). So a student could skip the
-- checkout route and POST /rest/v1/transactions directly:
--
--   { user_id: <self>, tenant_id: <own tenant>, product_id: <a $49 course>,
--     amount: 100, status: 'pending', payment_provider: 'solana',
--     settlement_currency: 'sol', settlement_base: 1 }
--
-- The row is 'pending', so it passed the #528 policy cleanly (reproduced against
-- a local database: the insert above succeeded as role `authenticated` with
-- alice's claims). They then pay 1 lamport, /api/payments/solana/verify finds
-- the transfer satisfies settlement_base, and flips the row to 'successful' on
-- the service-role client — firing trigger_manage_transactions and granting the
-- entitlement. Full course access for a fraction of a cent, through the
-- legitimate payment path.
--
-- WHICH COLUMNS ARE LOAD-BEARING (established before choosing a control).
--
--   settlement_base      the figure compared on-chain, and the amount the QR
--                        asks the wallet for. Load-bearing in both paths.
--   settlement_currency  selects `decimals` (6 for usdc, else 9) — wrong
--                        decimals move the verified amount by 10^3.
--   settlement_mint      selects which SPL token counts (NULL = native SOL); a
--                        caller-chosen mint is one the attacker can mint freely.
--   settlement_sol_usd   nothing reads it. Audit record of the locked quote only.
--   amount               the fallback both paths use when settlement_base IS
--                        NULL (legacy rows), and the figure getPayoutsOwed()
--                        sums. No webhook compares it against what the provider
--                        actually charged (lib/payments/webhook-dispatch.ts
--                        never reads it), so for Lemon Squeezy / PayPal /
--                        Binance an under-quoted `amount` does not buy access —
--                        those charge from their own catalogue — it understates
--                        the school's payout instead.
--
-- THE ROOT CAUSE IS THE GRANT, NOT THE COLUMNS.
--
-- #528 could not narrow INSERT columns because the table-level INSERT grant to
-- `authenticated` is what two API routes rely on. But nothing in the BROWSER
-- inserts into `transactions` — every legitimate insert already happens on the
-- server, and the complete list is:
--
--   app/api/payments/checkout/route.ts             user-scoped client
--   app/api/stripe/create-payment-intent/route.ts  user-scoped client
--   app/[locale]/(public)/checkout/actions.ts      admin client (since #528)
--   app/actions/payment-requests.ts:359            admin client
--   lib/payments/webhook-dispatch.ts, the Stripe webhook, the Solana/Binance
--   reconcilers, both cron routes, scripts/*, tests/playwright/*
--                                                  service role
--   grant_free_subscription()                      SECURITY DEFINER
--
-- The first two are the only reason the grant exists, and both already derive
-- every financial field server-side from trusted sources: `amount`, `currency`
-- and `payment_provider` come from tenant-scoped reads of `products` / `plans`,
-- and the settlement figures from `getSolUsdPrice()` — a live off-platform quote.
-- Moving those two inserts onto the admin client (this commit) leaves the grant
-- with no legitimate user, so it goes.
--
-- WHY NOT THE OTHER TWO DIRECTIONS THE ISSUE OFFERS.
--
--   A BEFORE INSERT trigger recomputing the values (the #512 pattern for
--   school_percentage_snapshot) would overwrite legitimate ones: completing a
--   payment request inserts the admin-confirmed `payment_amount`, and
--   grant_free_subscription() inserts a zero-amount row for its plan. Rewriting
--   or rejecting those converts a quiet mispricing into a broken payment path.
--   It also cannot help with native SOL at all: settlement_base is derived from
--   a live SOL/USD quote a trigger cannot obtain.
--
--   A SECURITY DEFINER RPC has the same blind spot from the other side. It
--   cannot fetch the quote either, so it would have to accept the rate as a
--   caller parameter — and the rate is precisely the value that must not be
--   caller-supplied, since settlement_base is computed from it. That moves the
--   vulnerability rather than closing it. Inserting on the admin client keeps
--   the quote from crossing the client boundary in either direction.
--
-- WHAT THIS LEAVES REACHABLE. Nothing, for an untrusted caller: INSERT is denied
-- outright here, and #528 already made `amount` and all four settlement_*
-- columns unwritable on UPDATE via the column grant. Both halves are needed —
-- either alone leaves a route to the same row.

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) Revoke INSERT. `POST /rest/v1/transactions` now fails with
--     `permission denied for table transactions`.
-- ---------------------------------------------------------------------------
--
-- A future user-scoped insert will fail loudly with that error rather than
-- silently writing a caller-priced row. That is the intended trade-off on a
-- payments table, and the same one #528 accepted for UPDATE.
--
-- `anon` is included for hygiene rather than to close a live path: the RLS
-- policies on this table are all `TO authenticated`, so an anonymous insert was
-- already rejected. Holding a grant that no policy can satisfy only invites a
-- later policy widening to become an unnoticed hole.
--
-- Untouched, deliberately: service_role (every webhook / reconciler / cron and
-- the four admin-client call sites), and the table owner — SECURITY DEFINER
-- functions run as the owner, so grant_free_subscription() still inserts its
-- zero-amount 'successful' row for the free-plan path.

REVOKE INSERT ON TABLE public.transactions FROM authenticated, anon;

-- The sequence grant is now unusable for its only purpose. Left in place: it is
-- harmless without INSERT, and revoking it would add a second thing to restore
-- if this migration is ever rolled back.

-- ---------------------------------------------------------------------------
-- (b) Keep #528's INSERT policy, and pin the settlement columns NULL in it.
-- ---------------------------------------------------------------------------
--
-- This policy is unreachable while (a) holds — no grant, no policy evaluation.
-- It is retained and tightened because (a) is a single `GRANT INSERT` away from
-- being undone: a rollback of this migration, a future schema dump that
-- re-applies the original `GRANT ALL ON TABLE transactions TO authenticated`
-- from 20260126190500_lms_complete.sql, or someone resolving a `permission
-- denied` error the direct way. In any of those cases the under-quote in this
-- issue stays impossible, because a user-scoped INSERT can no longer carry a
-- settlement claim at all — the columns must be NULL, which sends both Solana
-- paths down their legacy fallback (verify against `amount`) instead of
-- honouring a caller-supplied figure.
--
-- Note what the policy still cannot express: `amount` matching the product's
-- price. A WITH CHECK could subquery `products`/`plans` for it, but that would
-- couple this policy to those tables' SELECT policies — the coupling #512
-- explicitly refused for the same reason (tighten the other policy, and this one
-- starts silently rejecting or accepting the wrong thing). With the grant
-- revoked, `amount` is server-owned; if the grant is ever restored, `amount`
-- becomes caller-controlled again and that is a payout-accuracy problem to
-- reopen, not a course-access one.

DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND status = 'pending'
    AND settlement_currency IS NULL
    AND settlement_base IS NULL
    AND settlement_mint IS NULL
    AND settlement_sol_usd IS NULL
  );

COMMENT ON COLUMN public.transactions.settlement_base IS
  'Locked integer base amount the wallet must pay: lamports (sol) or token base units (usdc). Set once at checkout; /tx and /verify read this, never re-quote. Issue #538: server-owned — the on-chain payment is verified against this figure, so it is written only by a service-role client (app/api/payments/checkout/route.ts) and is unwritable by `authenticated` on both INSERT (grant revoked, 20260725180000) and UPDATE (column grant, 20260725170000).';

COMMIT;
