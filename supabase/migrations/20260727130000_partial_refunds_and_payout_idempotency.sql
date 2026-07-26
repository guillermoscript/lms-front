-- Issue #547 — money accuracy round 2.
--
-- Three schema changes, each backing one section of the issue:
--
--   1. `transactions.refunded_amount` — a refund is not binary. Every
--      platform-settled provider (PayPal, Lemon Squeezy, Binance) supports
--      partial refunds programmatically, but the shared dispatcher flipped the
--      whole row to 'refunded' regardless, which dropped the ENTIRE sale out of
--      `grossOwed` in `lib/payments/payouts-owed.ts`. A $10 goodwill refund on a
--      $100 PayPal sale removed $100 from what the school was owed — $72 of
--      under-payment at an 80% split — and revoked the student's access outright.
--
--   2. `payouts.idempotency_key` — `markPayoutPaid` inserts a manual payout with
--      no period and no key. The table's only uniqueness is
--      UNIQUE (tenant_id, period_start, period_end), and 20260724120000 made both
--      period columns nullable for exactly this path; Postgres treats NULLs as
--      distinct, so that constraint never fires for a manual row. A double
--      submit, a reload, a second tab or a server-action retry each recorded the
--      same wire twice, and `CHECK (amount > 0)` forbids a correcting negative
--      row.
--
--   3. `get_platform_revenue` — stops gating the platform fee on
--      `revenue_splits.applies_to_providers`. See the comment on that function
--      below.
--
-- LOCAL-ONLY: validated against the local stack; not pushed to cloud in this PR.

-- ---------------------------------------------------------------------------
-- 1. Partial refunds
-- ---------------------------------------------------------------------------

ALTER TABLE transactions
  ADD COLUMN refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (refunded_amount >= 0);

COMMENT ON COLUMN transactions.refunded_amount IS
  'Cumulative amount refunded on this sale, in MAJOR units of this row''s own `currency` — never a separate currency, never minor units. 0 = never refunded. A PARTIAL refund leaves `status` = ''successful'' and records the slice here; a FULL refund sets this equal to `amount` and flips `status` to ''refunded''. Readers that sum money must use (amount - refunded_amount), not amount. Server-write-only like the rest of this table (issue #538) — no new grant.';

-- Additive with a default, so every existing row reads as unrefunded and no
-- balance moves on deploy. `amount` is NUMERIC(10,2); the refunded slice shares
-- its scale so the two are exactly comparable with no float in between.
--
-- Deliberately NOT constrained to `<= amount`: the dispatcher already clamps the
-- accumulated total to the sale amount, and a CHECK across two columns would
-- turn a provider over-reporting a refund into a webhook that fails forever
-- instead of one that records the sale as fully refunded.

-- ---------------------------------------------------------------------------
-- 2. Manual-payout idempotency
-- ---------------------------------------------------------------------------

ALTER TABLE payouts
  ADD COLUMN idempotency_key TEXT;

COMMENT ON COLUMN payouts.idempotency_key IS
  'Client-generated key for a MANUAL payout, minted once per Mark-as-paid dialog open and replayed on every retry of that same submission. Enforced by idx_payouts_manual_idempotency. NULL for automated Connect payouts, which have their own uniqueness via period.';

-- Partial: only manual rows carry a key, and only non-NULL keys are unique, so
-- automated Connect payouts and pre-existing manual rows are untouched.
CREATE UNIQUE INDEX idx_payouts_manual_idempotency
  ON payouts (idempotency_key)
  WHERE payout_method = 'manual' AND idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Platform-fee model: retire `applies_to_providers`
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN revenue_splits.applies_to_providers IS
  'DEPRECATED (issue #547) — no longer read by anything. It stored the labels ''stripe''/''manual'', which are not provider slugs, so a PayPal/Lemon Squeezy/Binance sale fell outside it and was charged a 0% platform fee by the school-facing revenue screens while `getPayoutsOwed` applied the full 80/20 split to those same rows — two authoritative-looking screens differing by the entire platform fee. Whether the platform takes a cut is a property of the PROVIDER, not of the tenant, and now lives in one place: `ProviderCapabilities.bearsPlatformFee` in lib/payments/types.ts. The column is kept (not dropped) so no historical row is destroyed.';

-- Replace the RPC so /platform/revenue agrees with the school-facing revenue
-- screens and with getPayoutsOwed. Two changes:
--
--   * The fee is charged on every provider through which the platform actually
--     takes a cut — Stripe (application_fee_amount), the platform-settled trio
--     (PayPal/Lemon Squeezy/Binance, where the platform holds 100% and pays the
--     school out manually) and Solana (split on-chain from revenue_splits) —
--     and NOT on `manual` or `binance_personal`, where the money goes straight
--     to the school's own account and the platform never touches it. This list
--     mirrors `bearsPlatformFee`; the two must stay in step.
--
--   * The rate comes from the transaction's own `school_percentage_snapshot`
--     when it has one (the split in force when the sale happened, frozen by the
--     #512 backstop trigger), falling back to the tenant's current split. That
--     is the identical input `computeOwedBalances` uses, so the platform-facing
--     and school-facing figures reconcile by construction rather than by
--     coincidence — and a plan change no longer re-prices history here while
--     leaving the payout view alone (#496).
--
--   * Partially-refunded sales count for what the platform kept, not for what it
--     collected and gave back (`amount - refunded_amount`).

create or replace function public.get_platform_revenue(
  _start timestamptz default null,
  _end   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_mrr  numeric;
  -- Mirror of ProviderCapabilities.bearsPlatformFee (lib/payments/types.ts).
  v_fee_bearing text[] := array['stripe', 'paypal', 'lemonsqueezy', 'binance', 'solana', 'solana_subs'];
begin
  -- SaaS MRR (schools paying the platform), normalized to monthly dollars.
  select coalesce(sum(
    case when ps.interval = 'yearly' then pp.price_yearly / 12.0
         else pp.price_monthly end
  ), 0)::numeric
  into v_mrr
  from platform_subscriptions ps
  join platform_plans pp on pp.plan_id = ps.plan_id
  where ps.status = 'active';

  with tx as (
    select
      t.tenant_id,
      greatest(t.amount - coalesce(t.refunded_amount, 0), 0) as amount,
      t.transaction_date,
      coalesce(
        t.payment_provider,
        case when t.stripe_payment_intent_id is not null then 'stripe' else 'manual' end
      ) as provider,
      -- Platform share = 100 - the school's share, snapshotted per transaction.
      100 - coalesce(t.school_percentage_snapshot, rs.school_percentage, 80) as platform_percentage
    from transactions t
    left join revenue_splits rs on rs.tenant_id = t.tenant_id
    where t.status = 'successful'
      and (_start is null or t.transaction_date >= _start)
      and (_end   is null or t.transaction_date <= _end)
  ),
  tx_fee as (
    select
      tenant_id,
      amount,
      transaction_date,
      provider,
      case when provider = any(v_fee_bearing)
           then round(amount * platform_percentage / 100.0, 2)
           else 0 end as platform_fee
    from tx
  )
  select jsonb_build_object(
    'gmv',               (select coalesce(sum(amount), 0)       from tx_fee),
    'platform_fees',     (select coalesce(sum(platform_fee), 0) from tx_fee),
    'transaction_count', (select count(*)                       from tx_fee),
    'saas_mrr',          round(v_mrr, 2),
    'by_provider', (
      select coalesce(jsonb_agg(row order by row->>'fees' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'provider', provider,
          'gmv',   round(sum(amount), 2),
          'fees',  round(sum(platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee
        group by provider
      ) p
    ),
    'by_tenant', (
      select coalesce(jsonb_agg(row order by (row->>'fees')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'tenant_id', tf.tenant_id,
          'name',      coalesce(tn.name, 'Unknown'),
          'plan',      coalesce(tn.plan, 'free'),
          'gmv',   round(sum(tf.amount), 2),
          'fees',  round(sum(tf.platform_fee), 2),
          'count', count(*)
        ) as row
        from tx_fee tf
        left join tenants tn on tn.id = tf.tenant_id
        group by tf.tenant_id, tn.name, tn.plan
      ) t
    ),
    'monthly', (
      select coalesce(jsonb_agg(row order by row->>'month'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'month', to_char(date_trunc('month', transaction_date), 'YYYY-MM'),
          'gmv',  round(sum(amount), 2),
          'fees', round(sum(platform_fee), 2)
        ) as row
        from tx_fee
        group by date_trunc('month', transaction_date)
        order by date_trunc('month', transaction_date)
      ) m
    )
  )
  into result;

  return result;
end;
$$;

comment on function public.get_platform_revenue(timestamptz, timestamptz) is
  'Platform super-admin revenue/fees aggregated across all tenants: GMV net of refunds, computed platform fees (per-transaction snapshotted split, on fee-bearing providers only — see ProviderCapabilities.bearsPlatformFee), SaaS MRR, and by-provider/by-tenant/monthly breakdowns. Called by /platform/revenue.';

-- Same grants as 20260617120000 — super-admin data, service_role only.
revoke all on function public.get_platform_revenue(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_platform_revenue(timestamptz, timestamptz) to service_role;
