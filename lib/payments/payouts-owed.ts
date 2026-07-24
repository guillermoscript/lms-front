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
 * Refunds/chargebacks (issue #498): a transaction can flip from `successful`
 * to `refunded` after its payout was already recorded. Callers pass refunded
 * transactions through alongside successful ones (tagged via `status`); this
 * module scales each refund by the same split percentage a sale would've
 * used and surfaces it as a distinct `clawback` figure, subtracted from
 * `netOwed` on the next cycle rather than silently vanishing from
 * `grossCollected`/`grossOwed` with no trace.
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
  /** 'successful' contributes to grossCollected/grossOwed as normal; 'refunded' contributes its scaled amount to `clawback` instead (issue #498). */
  status: 'successful' | 'refunded'
}

export interface ManualPayoutRecord {
  tenantId: string
  amount: number
  /** payouts.currency — the currency this payout was actually recorded in. */
  currency: string
}

export interface CurrencyBalance {
  currency: string
  /** Sum of platform-settled transaction amounts in this currency (100% of what was collected). */
  grossCollected: number
  /** Sum over this currency's transactions of amount × (that transaction's snapshotted split, or the tenant's current split if unsnapshotted). */
  grossOwed: number
  /** Sum of manual payouts already recorded as paid in this currency. */
  alreadyPaid: number
  /** Sum over refunded transactions of amount × (that transaction's snapshotted split, or the tenant's current split) — money already paid out for sales that later got refunded (issue #498). */
  clawback: number
  /** max(grossOwed - alreadyPaid - clawback, 0) — what's currently owed in this currency. */
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

  for (const txn of txns) {
    const entry = bucket(txn.tenantId, txn.currency)
    const effectivePercentage = txn.schoolPercentageSnapshot ?? schoolPercentageByTenant.get(txn.tenantId) ?? 0
    const scaledAmount = (txn.amount * effectivePercentage) / 100
    if (txn.status === 'refunded') {
      entry.clawback += scaledAmount
      continue
    }
    entry.grossCollected += txn.amount
    entry.grossOwed += scaledAmount
    entry.byProvider[txn.paymentProvider] = (entry.byProvider[txn.paymentProvider] ?? 0) + txn.amount
  }

  const paidByTenantCurrency = new Map<string, Map<string, number>>()
  for (const payout of paidPayouts) {
    let byCurrency = paidByTenantCurrency.get(payout.tenantId)
    if (!byCurrency) {
      byCurrency = new Map()
      paidByTenantCurrency.set(payout.tenantId, byCurrency)
    }
    byCurrency.set(payout.currency, (byCurrency.get(payout.currency) ?? 0) + payout.amount)
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
      const netOwed = Math.max(grossOwed - alreadyPaid - clawback, 0)
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
