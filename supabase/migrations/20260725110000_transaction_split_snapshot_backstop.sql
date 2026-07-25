-- Issue #512 — database backstop for the revenue-split snapshot.
--
-- #496 fixed retroactive repricing by snapshotting revenue_splits.school_percentage
-- onto each transaction, but that snapshot is written at exactly ONE call site
-- (app/api/payments/checkout/route.ts). Every other transaction-insert path
-- omits it, and nothing fails when they do: computeOwedBalances() silently falls
-- back to the tenant's CURRENT split, which is the #496 bug returning by a side
-- door. The number is just quietly wrong.
--
-- This makes `transactions.school_percentage_snapshot` a DATABASE-OWNED column:
-- the value is computed here, from revenue_splits, and is immutable once set.
-- No caller writes it and no caller can tamper with it.
--
-- WHY THE COLUMN HAS TO BE DATABASE-OWNED, NOT MERELY DEFAULTED.
--
-- The obvious backstop is "fill it in when the caller omits it, and let an
-- explicit value win." That cannot be the rule here, because the explicit value
-- can come from a caller we do not trust. `transactions` grants ALL to
-- `authenticated` (20260126190500_lms_complete.sql), and the RLS policies in
-- 20260313025318_rls_transactions.sql restrict only WHICH ROWS a user may write,
-- never which columns:
--
--   CREATE POLICY "Users can create own transactions"
--     ON public.transactions FOR INSERT TO authenticated
--     WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());
--
-- So a student can POST /rest/v1/transactions with school_percentage_snapshot:
-- 100 — or UPDATE their own row to set it later — and that number flows straight
-- into computeOwedBalances()'s grossOwed, inflating what the platform believes it
-- owes their school. A backstop that defers to the explicit value would preserve
-- exactly the write we most need to override. Hence: computed on INSERT, frozen
-- on UPDATE.
--
-- (The column-privilege alternative — REVOKE INSERT, UPDATE (school_percentage_
-- snapshot) — is a no-op while the table-level grant is held. Closing it that way
-- means revoking table-level INSERT/UPDATE from `authenticated` and re-granting an
-- explicit column list, which silently breaks every column omitted from that list.
-- Owning the value in a trigger is the narrower change.)
--
-- WHY UPDATE, not INSERT alone.
--
-- payment_provider — the field getPayoutsOwed() filters on — is also written by
-- UPDATE, after the row exists:
--
--   lib/payments/webhook-dispatch.ts:205  .update({ status, payment_provider })
--   app/api/stripe/webhook/route.ts:406   same shape, Stripe subscriptions
--
-- dispatchBillingEvent is the shared activation path for PayPal, the unified
-- provider webhook (Lemon Squeezy et al), and Stripe. PayPal and Lemon Squeezy are
-- precisely the settlesToPlatformAccount providers the payout computation reads.
-- So a row inserted before this migration, carrying a NULL snapshot, can be turned
-- into a platform-settled transaction by a webhook and arrive in the payout math
-- with nothing snapshotted. Covering UPDATE closes that path.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--
-- 1. It never re-stamps a snapshot that already exists. Re-stamping a historical
--    transaction with a newer split would BE the #496 bug, not a fix for it. On
--    UPDATE the previous value is restored verbatim, so the row is frozen from the
--    moment it is first written — against tampering and against drift alike.
--
-- 2. It does not backfill existing NULLs, and it does not fill them on unrelated
--    updates. Rows predating 20260724140000 are documented (in that migration and
--    in lib/payments/payouts-owed.ts) to fall back to the tenant's current split.
--    Stamping today's split onto a year-old sale is the same retroactive repricing
--    #496 removed — it does not stop being that because it happens one row at a
--    time, when something incidental (a refund, an archive) touches the row. A
--    legacy NULL is therefore filled in exactly ONE case: the row is being
--    activated by a provider right now (payment_provider is changing), which is
--    the only moment at which today's split is the honest answer.
--
-- A CHECK constraint was the alternative offered in the issue. It cannot read
-- revenue_splits, and a check like `payment_provider IS NULL OR snapshot IS NOT
-- NULL` would hard-fail the webhook UPDATE above for any legacy NULL-snapshot row
-- a provider later activates — converting a quiet mispricing into a failed
-- activation and a lost sale. Filling the value beats rejecting the row.
--
-- The pre-existing after_transaction_insert / after_transaction_update triggers
-- are both AFTER, so these BEFORE triggers compose with them without ordering
-- concerns.

-- The fallback mirrors DEFAULT_SCHOOL_PERCENTAGE in lib/payments/payouts-owed.ts,
-- the revenue_splits.school_percentage column default, the 20% platform default in
-- app/api/stripe/create-payment-intent/route.ts, and the row seeded by
-- 20260216212440_create_revenue_infrastructure.sql. It is used only when a tenant
-- has no revenue_splits row at all. (tests/unit/transaction-split-snapshot-
-- backstop.test.ts fails if this number and the TypeScript constant drift apart.)
--
-- SECURITY DEFINER, deliberately — but not for the reason the surrounding code
-- comments claim. `app/api/payments/checkout/route.ts` says revenue_splits is
-- "super-admin-only under RLS"; it isn't. Despite its name, the SELECT policy from
-- 20260216212440 is:
--
--   "Admins can view own revenue split": tenant_id = get_tenant_id() OR is_super_admin()
--
-- — i.e. every member of the tenant, students included, can read their school's
-- split (verified against a local database). So an INVOKER function would in fact
-- work today, because the transactions INSERT policy already pins
-- NEW.tenant_id = get_tenant_id().
--
-- That is exactly why it must not be INVOKER. The correctness of this trigger would
-- then rest on a SELECT policy whose own name says it should be narrower — and the
-- day someone tightens it to match the name, this function stops seeing the row and
-- silently stamps the 80 fallback onto every checkout for every tenant. Wrong
-- payout numbers, no error, no failing test. DEFINER removes that coupling.
-- search_path is pinned for the usual reason.
CREATE OR REPLACE FUNCTION public.set_transaction_split_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_school_percentage numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Already snapshotted: frozen. Restoring OLD rather than comparing-and-
    -- raising means a tampering UPDATE is neutralised instead of failing the
    -- whole webhook that happened to carry it.
    IF OLD.school_percentage_snapshot IS NOT NULL THEN
      NEW.school_percentage_snapshot := OLD.school_percentage_snapshot;
      RETURN NEW;
    END IF;

    -- Legacy NULL row. Fill it only if a provider is activating it right now;
    -- otherwise keep the documented NULL fallback and discard whatever the
    -- caller tried to put there.
    IF NEW.payment_provider IS NOT DISTINCT FROM OLD.payment_provider THEN
      NEW.school_percentage_snapshot := NULL;
      RETURN NEW;
    END IF;
  END IF;

  -- INSERT, or the legacy-row activation case above. Either way the value is
  -- computed here; anything the caller supplied is ignored.
  IF NEW.tenant_id IS NULL THEN
    NEW.school_percentage_snapshot := NULL;
    RETURN NEW;
  END IF;

  SELECT school_percentage INTO v_school_percentage
  FROM revenue_splits
  WHERE tenant_id = NEW.tenant_id;

  NEW.school_percentage_snapshot := COALESCE(v_school_percentage, 80);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_transaction_split_snapshot() IS
  'Backstop for #496 (issue #512): owns transactions.school_percentage_snapshot. Computes it from revenue_splits on INSERT and freezes it on UPDATE, so neither an insert path that forgets nor a client that tampers (transactions RLS restricts rows, not columns) can affect the payout computation. Legacy NULL rows are filled only when a provider activates them (payment_provider changing), never on an incidental update.';

-- Named without the _insert suffix in an earlier revision of this migration.
DROP TRIGGER IF EXISTS before_transaction_split_snapshot ON transactions;

-- No WHEN clause: the point is to override whatever the caller sent, so this has
-- to run on every insert. It is one index lookup on revenue_splits (UNIQUE
-- (tenant_id), 20260216212440) against a table only written on payment events.
DROP TRIGGER IF EXISTS before_transaction_split_snapshot_insert ON transactions;
CREATE TRIGGER before_transaction_split_snapshot_insert
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transaction_split_snapshot();

-- OLD cannot be referenced in a WHEN clause on a combined INSERT OR UPDATE
-- trigger, which is why this is a second trigger rather than one. The clause
-- keeps ordinary status-only updates from calling the function at all: it fires
-- only when someone is touching the snapshot, or when a provider is activating
-- the row.
DROP TRIGGER IF EXISTS before_transaction_split_snapshot_update ON transactions;
CREATE TRIGGER before_transaction_split_snapshot_update
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  WHEN (
    NEW.school_percentage_snapshot IS DISTINCT FROM OLD.school_percentage_snapshot
    OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
  )
  EXECUTE FUNCTION public.set_transaction_split_snapshot();
