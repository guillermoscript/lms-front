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
  /** Successful transaction amount, major units. */
  amount: number
  /** revenue_splits.school_percentage in effect when this transaction was created (0–100), or null for pre-#496 rows. */
  schoolPercentageSnapshot: number | null
}

export interface ManualPayoutRecord {
  tenantId: string
  amount: number
}

export interface TenantOwed {
  tenantId: string
  tenantName: string
  schoolPercentage: number
  /** Sum of platform-settled transaction amounts (100% of what was collected). */
  grossCollected: number
  /** Sum over transactions of amount × (that transaction's snapshotted split, or the tenant's current split if unsnapshotted) — the school's all-time share. */
  grossOwed: number
  /** Sum of manual payouts already recorded as paid for this tenant. */
  alreadyPaid: number
  /** max(grossOwed - alreadyPaid, 0) — what's currently owed. */
  netOwed: number
  /** Per-provider breakdown of grossCollected. */
  byProvider: Record<string, number>
}

export function computeOwedBalances(
  tenants: TenantOwedInput[],
  txns: PlatformSettledTxn[],
  paidPayouts: ManualPayoutRecord[],
): TenantOwed[] {
  const schoolPercentageByTenant = new Map(tenants.map((t) => [t.tenantId, t.schoolPercentage]))

  const collectedByTenant = new Map<string, number>()
  const owedByTenant = new Map<string, number>()
  const byProviderByTenant = new Map<string, Record<string, number>>()
  for (const txn of txns) {
    collectedByTenant.set(txn.tenantId, (collectedByTenant.get(txn.tenantId) ?? 0) + txn.amount)

    const effectivePercentage = txn.schoolPercentageSnapshot ?? schoolPercentageByTenant.get(txn.tenantId) ?? 0
    owedByTenant.set(txn.tenantId, (owedByTenant.get(txn.tenantId) ?? 0) + (txn.amount * effectivePercentage) / 100)

    const byProvider = byProviderByTenant.get(txn.tenantId) ?? {}
    byProvider[txn.paymentProvider] = (byProvider[txn.paymentProvider] ?? 0) + txn.amount
    byProviderByTenant.set(txn.tenantId, byProvider)
  }

  const paidByTenant = new Map<string, number>()
  for (const payout of paidPayouts) {
    paidByTenant.set(payout.tenantId, (paidByTenant.get(payout.tenantId) ?? 0) + payout.amount)
  }

  return tenants.map((tenant) => {
    const grossCollected = collectedByTenant.get(tenant.tenantId) ?? 0
    const grossOwed = owedByTenant.get(tenant.tenantId) ?? 0
    const alreadyPaid = paidByTenant.get(tenant.tenantId) ?? 0
    const netOwed = Math.max(grossOwed - alreadyPaid, 0)
    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      schoolPercentage: tenant.schoolPercentage,
      grossCollected,
      grossOwed,
      alreadyPaid,
      netOwed,
      byProvider: byProviderByTenant.get(tenant.tenantId) ?? {},
    }
  })
}
