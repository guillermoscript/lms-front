/**
 * Manual payout tracking for "single-account" providers (paypal, binance
 * hosted, lemonsqueezy) — providers where 100% of every sale lands in the
 * PLATFORM's own account (see `ProviderCapabilities.settlesToPlatformAccount`
 * in `lib/payments/types.ts`), with no automatic split like Stripe Connect or
 * Solana. The platform owner owes each school its share and pays it out
 * manually; this computes a running balance: all-time collected minus
 * all-time manual payouts already marked paid. Callers pre-filter
 * transactions to platform-settled providers only — this module has no
 * DB/provider knowledge, just arithmetic.
 *
 * Owed amounts are computed PER TRANSACTION using the split percentage that
 * was in effect when each transaction happened (`schoolPercentageSnapshot`,
 * snapshotted at insert time in `app/api/payments/checkout/route.ts` — see
 * issue #496), not the tenant's current split applied retroactively to the
 * whole sum. A plan change (which rewrites `revenue_splits`) therefore only
 * affects transactions created after the change.
 *
 * Since issue #512 that snapshot is OWNED BY THE DATABASE, not by the caller.
 * `20260725110000_transaction_split_snapshot_backstop.sql` computes it from
 * `revenue_splits` on INSERT and freezes it on UPDATE, so:
 *
 *   - a transaction-insert path that forgets it (four of the five do) can't
 *     silently fall back to the current-split behaviour;
 *   - a webhook that sets `payment_provider` on an existing row post-insert
 *     (`lib/payments/webhook-dispatch.ts`) can't either;
 *   - and no client can supply the number. `transactions` grants ALL to
 *     `authenticated` and its RLS policies restrict which ROWS a user may
 *     write, never which columns — so without the trigger a student could set
 *     `school_percentage_snapshot: 100` on their own transaction and inflate
 *     `grossOwed` below.
 *
 * The value never changes once written, so history is never re-stamped —
 * re-stamping would be the #496 bug, not a fix for it.
 *
 * Transactions predating the snapshot column (`schoolPercentageSnapshot:
 * null`) still fall back to the tenant's current `schoolPercentage` — the
 * same behavior this module had before #496, so old data isn't retroactively
 * wrong either way. They were deliberately not backfilled: stamping today's
 * split onto history would manufacture the very repricing #496 removed. Such
 * a row is snapshotted in exactly one situation — a provider activating it
 * (its `payment_provider` changing), the one moment at which today's split is
 * the honest answer for it.
 *
 * Balances are grouped PER CURRENCY (issue #497) — a tenant with both USD and
 * EUR sales owes two separate numbers, never one meaningless summed total.
 * `transactions.currency` and `payouts.currency` are trusted as given; this
 * module does no currency conversion, only grouping.
 *
 * Refunds/chargebacks (issues #498, #511): a transaction can flip from
 * `successful` to `refunded` after its payout was already recorded. Callers
 * pass refunded transactions through alongside successful ones (tagged via
 * `status`), and refunded sales are simply left out of
 * `grossCollected`/`grossOwed`.
 *
 * That exclusion is the ONLY place a refund moves `netOwed`, and it is
 * sufficient on its own: `alreadyPaid` is the all-time sum of recorded
 * payouts, so it still contains whatever was paid out for a sale that later
 * flipped to `refunded`. Dropping the sale from `grossOwed` while leaving its
 * payout inside `alreadyPaid` recovers the overpayment automatically —
 * 1000 successful plus a refunded 100 at an 80% split with 80 already paid
 * gives `800 - 80 = 720`, the correct figure. Subtracting the refund a second
 * time as a `clawback` term (as this module did before #511) understated the
 * balance and also penalised refunds that had never been paid out at all.
 *
 * `clawback` therefore survives as a REPORTING-ONLY figure and is not part of
 * the `netOwed` arithmetic. It answers "how much of what we already paid this
 * school was for sales that have since been refunded?", so an operator can
 * see why a balance dropped. Because it is already netted out of `netOwed` via
 * `alreadyPaid`, it must never be collected a second time.
 *
 * A refund only counts toward `clawback` when a payout plausibly covered it:
 * its `transactionDate` must fall at or before the latest `coveredThrough` of
 * that tenant's payouts IN THE SAME CURRENCY. This is a heuristic — the module
 * has no record of which transactions a given payout settled — so it can
 * overstate `clawback` when a payout deliberately skipped a sale. That
 * inaccuracy cannot move `netOwed`; making it exact needs real payout-to-
 * transaction linkage on `payouts`.
 *
 * `netOwed` keeps its floor at 0, so a school overpaid beyond its outstanding
 * balance reads 0 rather than a negative — only a payout row moves money, and
 * this view never invents a reverse one.
 *
 * Issue #547 made that floor a half-cent threshold rather than a comparison
 * against 0, and rounds each transaction's share to whole cents before summing.
 * Unrounded, one $49.99 sale at 80% owes `39.992`; the operator pays the
 * `39.99` the dialog offers (`payouts.amount` is `NUMERIC(10,2)` — whole cents
 * are all that can be recorded), and the school is left owed `0.002` forever,
 * rendered as `$0.00` on a row whose Mark-as-paid button never stops inviting a
 * second payment. Any `.99` price at any non-trivial split does this, and the
 * residue compounds each cycle. `roundMoney` and `MONEY_EPSILON` below are the
 * two halves of the fix, and every consumer of `netOwed` must compare against
 * the latter rather than against 0.
 *
 * Also since #547, a refund is not all-or-nothing: a `successful` row carrying
 * a non-zero `refundedAmount` contributes `amount - refundedAmount`, so a
 * partial refund removes only what was actually given back.
 *
 * #516: that floor also hid the overpayment's size. `overpaid` reports it
 * explicitly — `alreadyPaid - grossOwed` when positive, else 0 — while
 * `netOwed` keeps the floor its consumers (metric cards, the mismatch guard,
 * the school-facing view) rely on. Nothing recovers an overpayment as a
 * reverse entry: `payouts.amount` carries `CHECK (amount > 0)`, so a negative
 * adjusting row cannot be written at all. It is recovered by carry-forward
 * instead — `alreadyPaid` is an all-time sum, so the next cycle's
 * `grossOwed - alreadyPaid` starts in the hole and absorbs the excess with no
 * operator action. `overpaid` exists so that recovery is visible while it
 * happens rather than looking like an unexplained zero balance.
 *
 * Carry-forward only recovers anything for a school that keeps selling. A
 * dormant or departed school's overpayment sits here indefinitely, and so does
 * one caused by a mis-keyed payout row; both have to be settled outside the
 * platform. The UI says so rather than promising the balance resolves itself.
 */

/** Used when a tenant has no `revenue_splits` row yet (shouldn't normally happen, but keeps callers from dividing by an absent value). */
export const DEFAULT_SCHOOL_PERCENTAGE = 80

/**
 * Half a cent — the width of the gap between a balance that is settled and one
 * that merely rounds to `$0.00` on screen (issue #547).
 *
 * `payouts.amount` is `NUMERIC(10,2)`, so an operator can only ever pay whole
 * cents, while an unrounded share (a $49.99 sale at 80% = `39.992`) is not one.
 * The difference parked `0.002` as a permanent balance on a row rendering
 * `$0.00` whose Mark-as-paid button stayed enabled forever. Every consumer of
 * `netOwed` compares against THIS, never against 0.
 */
export const MONEY_EPSILON = 0.005

/**
 * Round to the currency's minor unit, half away from zero.
 *
 * Applied to each transaction's share BEFORE accumulating, not to the total:
 * the total is what an operator pays in whole cents, so the residue has to be
 * resolved per row or it re-accumulates every cycle.
 *
 * `Math.round` is half-UP, which on the school's share means a tie (…5 at the
 * third decimal) goes to the school. That is the deliberate direction: the
 * platform computes this number and must not round systematically in its own
 * favour. The `Number.EPSILON` nudge keeps values like `1.005` — stored as
 * 1.00499999999999989 in binary float — from rounding DOWN and quietly
 * reversing that choice.
 */
export function roundMoney(value: number): number {
  const scaled = value * 100
  return Math.round(scaled + (scaled >= 0 ? Number.EPSILON : -Number.EPSILON) * Math.abs(scaled)) / 100
}

/**
 * A payout more than 10% off the currently owed balance is flagged for
 * confirmation (it catches a mistyped extra zero) without ever hard-blocking a
 * legitimate rounded or ahead-of-schedule payment.
 */
export const MISMATCH_THRESHOLD_PCT = 0.1

/**
 * True when a payout is far enough from the outstanding balance to be worth a
 * second look.
 *
 * Lives here rather than beside `markPayoutPaid` for two reasons: a `'use
 * server'` module may only export async functions, and the boundary needs
 * direct coverage (#547). At `netOwed === 0` the tolerance is 0, so ANY
 * positive amount is challenged — the right behaviour (a school owed nothing
 * should not be paid without a deliberate confirmation), but one that was
 * previously reachable only through the whole server action and had no test at
 * all.
 */
export function isPayoutMismatch(amount: number, netOwed: number): boolean {
  return Math.abs(amount - netOwed) > netOwed * MISMATCH_THRESHOLD_PCT
}

/**
 * What the platform actually kept from a sale: the amount minus anything
 * refunded (issue #547). Floors at 0 so an over-reported refund can never
 * invert a sale into a negative.
 */
export function netOfRefunds(amount: number, refundedAmount: number | null | undefined): number {
  return Math.max(amount - (refundedAmount ?? 0), 0)
}

export interface TenantOwedInput {
  tenantId: string
  tenantName: string
  /** revenue_splits.school_percentage for this tenant today (0–100); used as the fallback for transactions with no snapshot. */
  schoolPercentage: number
}

export interface PlatformSettledTxn {
  tenantId: string
  paymentProvider: string
  /** Transaction amount, major units, in `currency` — always positive regardless of `status`. */
  amount: number
  /** transactions.currency (e.g. 'usd', 'eur'). */
  currency: string
  /**
   * `transactions.refunded_amount` — how much of `amount` has been given back,
   * in the same currency and major units (issue #547). Null/absent = nothing.
   *
   * A PARTIAL refund arrives here as a `successful` row with this set, and only
   * the refunded slice leaves `grossCollected`/`grossOwed`. Before #547 every
   * refund flipped the row to `refunded` wholesale, so a $10 goodwill refund on
   * a $100 sale dropped all $100 — under-paying the school $72 at an 80% split.
   */
  refundedAmount?: number | null
  /** revenue_splits.school_percentage in effect when this transaction was created (0–100), or null for pre-#496 rows. */
  schoolPercentageSnapshot: number | null
  /** 'successful' contributes (net of `refundedAmount`) to grossCollected/grossOwed; 'refunded' — a FULL refund — is left out of both (issues #498, #511, #547). */
  status: 'successful' | 'refunded'
  /**
   * `transactions.transaction_date` (ISO 8601) — that table has no `created_at`.
   * Only read for refunded rows, to decide whether a payout plausibly covered
   * this sale before it was refunded (issue #511). Null means "unknown", which
   * is treated as not covered rather than assumed covered.
   */
  transactionDate: string | null
}

export interface ManualPayoutRecord {
  tenantId: string
  amount: number
  /** payouts.currency — the currency this payout was actually recorded in. */
  currency: string
  /**
   * The point in time this payout is understood to settle up to (ISO 8601) —
   * `payouts.period_end` when the payout recorded one, else `paid_at`, else
   * `created_at`. Refunded sales dated at or before it are counted as having
   * been paid out already (issue #511). Null means "unknown", and covers
   * nothing.
   */
  coveredThrough: string | null
}

export interface CurrencyBalance {
  currency: string
  /** Sum of platform-settled transaction amounts in this currency (100% of what was collected). */
  grossCollected: number
  /** Sum over this currency's transactions of amount × (that transaction's snapshotted split, or the tenant's current split if unsnapshotted). */
  grossOwed: number
  /** Sum of manual payouts already recorded as paid in this currency. */
  alreadyPaid: number
  /**
   * REPORTING ONLY — not a term in `netOwed` (issue #511). Sum, over refunded
   * transactions a payout plausibly covered, of amount × (that transaction's
   * snapshotted split, or the tenant's current split): how much of what was
   * already paid to this school was for sales that have since been refunded.
   * `alreadyPaid` already accounts for it, so it must not be recovered again.
   */
  clawback: number
  /** grossOwed - alreadyPaid, floored to 0 below half a cent (`MONEY_EPSILON`) — what's currently owed in this currency. */
  netOwed: number
  /**
   * alreadyPaid - grossOwed, floored to 0 below half a cent — how far past the outstanding balance this
   * school has been paid in this currency (issue #516). Mutually exclusive with
   * `netOwed`: at most one of the two is ever non-zero. Carried forward, not
   * clawed back — it shrinks on its own as new sales land.
   */
  overpaid: number
  /** Per-provider breakdown of grossCollected in this currency. */
  byProvider: Record<string, number>
}

export interface TenantOwed {
  tenantId: string
  tenantName: string
  schoolPercentage: number
  /** One entry per currency this tenant has platform-settled activity or payouts in. Never summed across currencies. */
  balances: CurrencyBalance[]
}

export function computeOwedBalances(
  tenants: TenantOwedInput[],
  txns: PlatformSettledTxn[],
  paidPayouts: ManualPayoutRecord[],
): TenantOwed[] {
  const schoolPercentageByTenant = new Map(tenants.map((t) => [t.tenantId, t.schoolPercentage]))

  // tenantId -> currency -> partial balance
  const byTenantCurrency = new Map<string, Map<string, { grossCollected: number; grossOwed: number; clawback: number; byProvider: Record<string, number> }>>()

  function bucket(tenantId: string, currency: string) {
    let byCurrency = byTenantCurrency.get(tenantId)
    if (!byCurrency) {
      byCurrency = new Map()
      byTenantCurrency.set(tenantId, byCurrency)
    }
    let entry = byCurrency.get(currency)
    if (!entry) {
      entry = { grossCollected: 0, grossOwed: 0, clawback: 0, byProvider: {} }
      byCurrency.set(currency, entry)
    }
    return entry
  }

  const paidByTenantCurrency = new Map<string, Map<string, number>>()
  // tenantId -> currency -> latest `coveredThrough` across that currency's payouts.
  // Payouts are cumulative and all-time, so the latest one bounds everything any
  // payout could have settled.
  const coveredThroughByTenantCurrency = new Map<string, Map<string, number>>()
  for (const payout of paidPayouts) {
    let byCurrency = paidByTenantCurrency.get(payout.tenantId)
    if (!byCurrency) {
      byCurrency = new Map()
      paidByTenantCurrency.set(payout.tenantId, byCurrency)
    }
    byCurrency.set(payout.currency, (byCurrency.get(payout.currency) ?? 0) + payout.amount)

    if (payout.coveredThrough) {
      // Parsed rather than string-compared: `paid_at` and `period_end` reach us
      // as whatever offset format their source used ('…Z' vs '…+00:00'), which
      // lexicographic comparison gets wrong across formats.
      const covered = Date.parse(payout.coveredThrough)
      if (Number.isNaN(covered)) continue
      let coveredByCurrency = coveredThroughByTenantCurrency.get(payout.tenantId)
      if (!coveredByCurrency) {
        coveredByCurrency = new Map()
        coveredThroughByTenantCurrency.set(payout.tenantId, coveredByCurrency)
      }
      const previous = coveredByCurrency.get(payout.currency)
      if (previous == null || covered > previous) {
        coveredByCurrency.set(payout.currency, covered)
      }
    }
  }

  /**
   * True when a payout in the same tenant AND currency settled up to a point at
   * or after this sale, so its share plausibly went out before the refund. A
   * missing date on either side answers false — an unjustifiable clawback is
   * worse than a missing one (issue #511).
   */
  function wasPlausiblyPaidOut(txn: PlatformSettledTxn) {
    if (!txn.transactionDate) return false
    const soldAt = Date.parse(txn.transactionDate)
    if (Number.isNaN(soldAt)) return false
    const coveredThrough = coveredThroughByTenantCurrency.get(txn.tenantId)?.get(txn.currency)
    return coveredThrough != null && soldAt <= coveredThrough
  }

  for (const txn of txns) {
    const entry = bucket(txn.tenantId, txn.currency)
    const effectivePercentage = txn.schoolPercentageSnapshot ?? schoolPercentageByTenant.get(txn.tenantId) ?? 0
    // Partial refunds reduce the sale rather than erasing it (#547). A fully
    // refunded row reaches the branch below and leaves entirely, as before.
    const kept = netOfRefunds(txn.amount, txn.refundedAmount)
    // Rounded PER TRANSACTION, before accumulating — see `roundMoney`.
    const scaledAmount = roundMoney((kept * effectivePercentage) / 100)
    if (txn.status === 'refunded') {
      // Reporting only. Leaving the sale out of grossOwed below is what actually
      // corrects the balance; this just names the amount for the operator. Uses
      // the FULL sale: a row that reached 'refunded' has `refunded_amount` equal
      // to `amount`, so `kept` is 0 and the operator would be told a payout for
      // a refunded sale was worth nothing.
      if (wasPlausiblyPaidOut(txn)) {
        entry.clawback += roundMoney((txn.amount * effectivePercentage) / 100)
      }
      continue
    }
    entry.grossCollected += kept
    entry.grossOwed += scaledAmount
    entry.byProvider[txn.paymentProvider] = (entry.byProvider[txn.paymentProvider] ?? 0) + kept
  }

  return tenants.map((tenant) => {
    const collected = byTenantCurrency.get(tenant.tenantId) ?? new Map()
    const paid = paidByTenantCurrency.get(tenant.tenantId) ?? new Map()

    // A currency can appear only in payouts (fully paid off, no outstanding
    // transactions left in this grouping) — union both key sets so it's not dropped.
    const currencies = new Set<string>([...collected.keys(), ...paid.keys()])

    const balances: CurrencyBalance[] = Array.from(currencies).map((currency) => {
      const entry = collected.get(currency)
      // Re-rounded on the way out: each term is a sum of already-rounded cents,
      // but float addition still leaves dust (0.1 + 0.2 = 0.30000000000000004).
      const grossCollected = roundMoney(entry?.grossCollected ?? 0)
      const grossOwed = roundMoney(entry?.grossOwed ?? 0)
      const clawback = roundMoney(entry?.clawback ?? 0)
      const alreadyPaid = roundMoney(paid.get(currency) ?? 0)
      const difference = roundMoney(grossOwed - alreadyPaid)
      // `clawback` is deliberately absent here — refunded sales are already out
      // of `grossOwed`, and their payouts are still inside `alreadyPaid`, so the
      // overpayment nets out on its own. Subtracting it again double-counted the
      // refund (issue #511).
      //
      // Settled below half a cent reads as settled (issue #547): a residue no
      // operator can pay must not leave a row permanently actionable.
      const netOwed = difference > MONEY_EPSILON ? difference : 0
      // The same difference in the other direction, reported rather than
      // clamped away (issue #516).
      const overpaid = -difference > MONEY_EPSILON ? -difference : 0
      return {
        currency,
        grossCollected,
        grossOwed,
        alreadyPaid,
        clawback,
        netOwed,
        overpaid,
        byProvider: Object.fromEntries(
          Object.entries(entry?.byProvider ?? {}).map(([provider, total]) => [provider, roundMoney(Number(total))]),
        ),
      }
    })

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      schoolPercentage: tenant.schoolPercentage,
      balances,
    }
  })
}
