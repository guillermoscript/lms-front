-- Expire abandoned hosted checkouts so a customer can retry (issue #624).
--
-- A hosted checkout (PayPal, Lemon Squeezy, Binance Pay) inserts a `pending`
-- transaction and then redirects. Both partial unique indexes
-- (transactions_unique_product / transactions_unique_plan) cover
-- status IN ('pending','successful'), so an abandoned redirect leaves a row
-- that blocks the buyer's replacement checkout forever. PayPal orders expire
-- remotely with no guaranteed terminal webhook and Lemon Squeezy emits no
-- one-time failure event for this path, so nothing clears the row today.
--
-- Terminal state for an abandoned checkout is 'canceled', deliberately NOT
-- 'failed': trigger_manage_transactions runs `cancel_subscription(user, plan)`
-- on a 'failed' plan row, so expiring an abandoned RENEWAL checkout as 'failed'
-- would cancel the subscription the buyer is still paying for. 'canceled' is
-- outside both unique predicates and outside every branch of that trigger.

alter table public.transactions
  add column if not exists checkout_expires_at timestamptz,
  add column if not exists provider_checkout_id text,
  add column if not exists expired_at timestamptz,
  add column if not exists revived_at timestamptz,
  add column if not exists duplicate_settlement_at timestamptz;

comment on column public.transactions.checkout_expires_at is
  'Local TTL for a hosted-checkout redirect. NULL for rails that settle in-band (Stripe Elements, Solana Pay, manual).';
comment on column public.transactions.provider_checkout_id is
  'Provider-side checkout/order identity captured at creation (PayPal order id, Binance prepayId). Lets the reconciler ask the provider what actually happened before expiring a row.';
comment on column public.transactions.expired_at is
  'Set when the reconciler expired an abandoned checkout. A non-NULL value plus status=''canceled'' is what makes a row eligible for late-settlement revival.';
comment on column public.transactions.revived_at is
  'Set when a provider success arrived AFTER local expiry and this row was revived to ''successful''.';
comment on column public.transactions.duplicate_settlement_at is
  'Set when a provider success arrived after local expiry but a REPLACEMENT purchase had already settled. The buyer paid twice; this row stays non-revenue and needs a refund.';

-- One provider checkout maps to at most one local transaction. Mirrors
-- transactions_provider_charge_id_unique: the identity, not the row, is unique.
create unique index if not exists transactions_provider_checkout_id_unique
  on public.transactions (payment_provider, provider_checkout_id)
  where provider_checkout_id is not null;

-- The reconciler's queue: pending rows whose local TTL has lapsed.
create index if not exists transactions_stale_hosted_checkout
  on public.transactions (checkout_expires_at)
  where status = 'pending' and checkout_expires_at is not null;

-- Settle a provider success that arrived after the local checkout expired.
--
-- The window this closes: the reconciler expires an abandoned checkout, the
-- buyer retries, and only then does the original provider payment land. Three
-- outcomes, decided under a row lock so a concurrent webhook cannot pick a
-- different one:
--
--   'revived'    nothing else settled — this payment is the real one. Release
--                any sibling checkout still pending (the buyer's replacement
--                attempt is moot now, and leaving it would violate the partial
--                unique index the moment this row goes 'successful'), then flip
--                to 'successful' so after_transaction_update enrolls exactly
--                once. That trigger keys off NEW.status alone, so a
--                canceled → successful transition enrolls the same as
--                pending → successful.
--   'duplicate'  a REPLACEMENT purchase already settled — the buyer was charged
--                twice. Never revive: it would double-enroll and double-count
--                revenue. Stamp duplicate_settlement_at and leave the row
--                non-revenue so `amount - refunded_amount` sums stay honest.
--   'ineligible' not an expired checkout (already successful, still pending, or
--                never expired). The caller keeps its normal status guard.
create or replace function public.settle_expired_checkout(
  _transaction_id bigint
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transaction_row public.transactions%rowtype;
  replacement_id bigint;
begin
  select * into transaction_row
  from public.transactions
  where transaction_id = _transaction_id
  for update;

  if not found then
    return 'ineligible';
  end if;

  -- 'successful' is already settled; 'pending' is the caller's normal path.
  -- Only a row this system expired can be revived — a refund or an admin
  -- cancellation must never be resurrected by a replayed webhook.
  if transaction_row.status <> 'canceled' or transaction_row.expired_at is null then
    return 'ineligible';
  end if;

  -- Scope the sibling search the same way the partial unique indexes do:
  -- product-shaped and plan-shaped purchases are separate namespaces.
  select t.transaction_id into replacement_id
  from public.transactions t
  where t.user_id = transaction_row.user_id
    and t.transaction_id <> transaction_row.transaction_id
    and t.status = 'successful'
    and (
      (transaction_row.product_id is not null
        and t.product_id = transaction_row.product_id
        and t.plan_id is null)
      or (transaction_row.plan_id is not null
        and t.plan_id = transaction_row.plan_id
        and t.product_id is null)
    )
  limit 1;

  if replacement_id is not null then
    update public.transactions
    set duplicate_settlement_at = coalesce(duplicate_settlement_at, clock_timestamp())
    where transaction_id = _transaction_id;
    return 'duplicate';
  end if;

  -- Release the buyer's replacement attempt. It is still pending precisely
  -- because it never settled, so nothing is lost and the unique index stays
  -- satisfiable. Stamp expired_at so a late success on THAT row can revive in
  -- turn if this one is later refunded.
  update public.transactions t
  set status = 'canceled',
      expired_at = coalesce(t.expired_at, clock_timestamp())
  where t.user_id = transaction_row.user_id
    and t.transaction_id <> transaction_row.transaction_id
    and t.status = 'pending'
    and (
      (transaction_row.product_id is not null
        and t.product_id = transaction_row.product_id
        and t.plan_id is null)
      or (transaction_row.plan_id is not null
        and t.plan_id = transaction_row.plan_id
        and t.product_id is null)
    );

  update public.transactions
  set status = 'successful',
      revived_at = clock_timestamp()
  where transaction_id = _transaction_id;

  return 'revived';
end;
$$;

revoke all on function public.settle_expired_checkout(bigint)
  from public, anon, authenticated;
grant execute on function public.settle_expired_checkout(bigint) to service_role;
