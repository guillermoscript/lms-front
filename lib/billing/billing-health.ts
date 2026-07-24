/**
 * Computes the "billing health" view for super admins: which tenants are
 * currently `past_due` and how much runway they have before an automatic
 * downgrade to free.
 *
 * Two past-due paths write `tenants.billing_status = 'past_due'`, and they
 * carry different amounts of information:
 *  - manual_transfer (app/api/cron/expire-platform-subscriptions/route.ts)
 *    stamps a real `platform_subscriptions.grace_period_end` deadline —
 *    downgrade date is exact.
 *  - stripe (app/api/stripe/platform-webhook/route.ts) has no local grace
 *    deadline — Stripe's own dunning/retry schedule decides when
 *    `customer.subscription.deleted` eventually fires. There is no column
 *    anywhere that stores that date, so this module reports `isEstimate:
 *    true` with a null countdown instead of fabricating one.
 *
 * Pure/no I/O: callers pass `now` explicitly so this stays deterministic
 * for tests (mirrors lib/payments/payouts-owed.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface AtRiskTenantInput {
  tenantId: string
  tenantName: string
  plan: string | null
  accessCutoffAt: string | null
}

export interface PastDueSubscriptionInput {
  tenantId: string
  paymentMethod: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
}

export interface AtRiskTenant {
  tenantId: string
  tenantName: string
  plan: string | null
  paymentMethod: string | null
  pastDueSince: string | null
  graceEndsAt: string | null
  /** Ceil'd days remaining before auto-downgrade; null when not computable (Stripe, or no grace data). */
  daysUntilDowngrade: number | null
  /** True when there is no fixed downgrade date to report (Stripe-managed dunning). */
  isEstimate: boolean
  accessCutoffAt: string | null
}

export function computeBillingHealth(
  tenants: AtRiskTenantInput[],
  subscriptions: PastDueSubscriptionInput[],
  now: Date,
): AtRiskTenant[] {
  const subByTenant = new Map<string, PastDueSubscriptionInput>()
  for (const sub of subscriptions) {
    subByTenant.set(sub.tenantId, sub)
  }

  const results = tenants.map((tenant) => {
    const sub = subByTenant.get(tenant.tenantId) ?? null
    const paymentMethod = sub?.paymentMethod ?? null
    const isManualTransfer = paymentMethod === 'manual_transfer'

    const graceEndsAt = isManualTransfer ? sub?.gracePeriodEnd ?? null : null
    const daysUntilDowngrade =
      isManualTransfer && graceEndsAt
        ? Math.ceil((new Date(graceEndsAt).getTime() - now.getTime()) / DAY_MS)
        : null

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      plan: tenant.plan,
      paymentMethod,
      pastDueSince: sub?.currentPeriodEnd ?? null,
      graceEndsAt,
      daysUntilDowngrade,
      isEstimate: !isManualTransfer,
      accessCutoffAt: tenant.accessCutoffAt,
    }
  })

  return results.sort((a, b) => {
    if (a.daysUntilDowngrade === null && b.daysUntilDowngrade === null) return 0
    if (a.daysUntilDowngrade === null) return 1
    if (b.daysUntilDowngrade === null) return -1
    return a.daysUntilDowngrade - b.daysUntilDowngrade
  })
}
