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
 * affects transactions created after the change. Transactions predating the
 * snapshot column (`schoolPercentageSnapshot: null`) fall back to the
 * tenant's current `schoolPercentage` — the same behavior this module had
 * before #496, so old data isn't retroactively wrong either way.
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
 * `netOwed` keeps its `Math.max(…, 0)` floor, so a school overpaid beyond its
 * outstanding balance reads 0 rather than a negative — only a payout row moves
 * money, and this view never invents a reverse one. The unrecovered remainder
 * in that situation is visible through `clawback`.
 */

/** Used when a tenant has no `revenue_splits` row yet (shouldn't normally happen, but keeps callers from dividing by an absent value). */
export const DEFAULT_SCHOOL_PERCENTAGE = 80

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
  /** revenue_splits.school_percentage in effect when this transaction was created (0–100), or null for pre-#496 rows. */
  schoolPercentageSnapshot: number | null
  /** 'successful' contributes to grossCollected/grossOwed as normal; 'refunded' is left out of both (issues #498, #511). */
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
  /** max(grossOwed - alreadyPaid, 0) — what's currently owed in this currency. */
  netOwed: number
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
    const scaledAmount = (txn.amount * effectivePercentage) / 100
    if (txn.status === 'refunded') {
      // Reporting only. Leaving the sale out of grossOwed below is what actually
      // corrects the balance; this just names the amount for the operator.
      if (wasPlausiblyPaidOut(txn)) entry.clawback += scaledAmount
      continue
    }
    entry.grossCollected += txn.amount
    entry.grossOwed += scaledAmount
    entry.byProvider[txn.paymentProvider] = (entry.byProvider[txn.paymentProvider] ?? 0) + txn.amount
  }

  return tenants.map((tenant) => {
    const collected = byTenantCurrency.get(tenant.tenantId) ?? new Map()
    const paid = paidByTenantCurrency.get(tenant.tenantId) ?? new Map()

    // A currency can appear only in payouts (fully paid off, no outstanding
    // transactions left in this grouping) — union both key sets so it's not dropped.
    const currencies = new Set<string>([...collected.keys(), ...paid.keys()])

    const balances: CurrencyBalance[] = Array.from(currencies).map((currency) => {
      const entry = collected.get(currency)
      const grossCollected = entry?.grossCollected ?? 0
      const grossOwed = entry?.grossOwed ?? 0
      const clawback = entry?.clawback ?? 0
      const alreadyPaid = paid.get(currency) ?? 0
      // `clawback` is deliberately absent here — refunded sales are already out
      // of `grossOwed`, and their payouts are still inside `alreadyPaid`, so the
      // overpayment nets out on its own. Subtracting it again double-counted the
      // refund (issue #511).
      const netOwed = Math.max(grossOwed - alreadyPaid, 0)
      return {
        currency,
        grossCollected,
        grossOwed,
        alreadyPaid,
        clawback,
        netOwed,
        byProvider: entry?.byProvider ?? {},
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
