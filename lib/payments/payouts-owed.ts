/**
 * Manual payout tracking for "single-account" providers (paypal, binance
 * hosted, lemonsqueezy) — providers where 100% of every sale lands in the
 * PLATFORM's own account (see `ProviderCapabilities.settlesToPlatformAccount`
 * in `lib/payments/types.ts`), with no automatic split like Stripe Connect or
 * Solana. The platform owner owes each school its share and pays it out
 * manually; this computes a running balance: all-time collected × the
 * tenant's school_percentage, minus all-time manual payouts already marked
 * paid. Callers pre-filter transactions to platform-settled providers only —
 * this module has no DB/provider knowledge, just arithmetic.
 */

export interface TenantOwedInput {
  tenantId: string
  tenantName: string
  /** revenue_splits.school_percentage for this tenant (0–100). */
  schoolPercentage: number
}

export interface PlatformSettledTxn {
  tenantId: string
  paymentProvider: string
  /** Successful transaction amount, major units. */
  amount: number
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
  /** grossCollected * schoolPercentage / 100 — the school's all-time share. */
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
  const collectedByTenant = new Map<string, number>()
  const byProviderByTenant = new Map<string, Record<string, number>>()
  for (const txn of txns) {
    collectedByTenant.set(txn.tenantId, (collectedByTenant.get(txn.tenantId) ?? 0) + txn.amount)
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
    const grossOwed = (grossCollected * tenant.schoolPercentage) / 100
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
