/**
 * Computes the "billing health" view for super admins: which tenants are
 * at risk and how much runway they have before an automatic downgrade to
 * free.
 *
 * #514: "at risk" is a union of three populations, not just one. A tenant
 * qualifies when `tenants.billing_status = 'past_due'`, **or** it has a
 * `platform_subscriptions` row with `status = 'past_due'` (the two can drift
 * apart, and the sub-only case used to be invisible here), **or** it has an
 * `access_cutoff_at` scheduled by #494 — an over-limit tenant that is paying
 * on time never showed up at all, so the cutoff column could only ever hold
 * a value for a tenant that was *also* past due. Each row carries the
 * `reasons` it qualified under; a tenant can qualify under several, and
 * collapsing that would hide exactly the drift this view exists to surface.
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

/** Why a tenant appears in the at-risk list. A tenant may qualify under several. */
export type AtRiskReason =
  | 'tenant_past_due'
  | 'subscription_past_due'
  | 'access_cutoff_scheduled'

const REASON_ORDER: AtRiskReason[] = [
  'tenant_past_due',
  'subscription_past_due',
  'access_cutoff_scheduled',
]

export interface AtRiskTenantInput {
  tenantId: string
  tenantName: string
  plan: string | null
  accessCutoffAt: string | null
  reasons: AtRiskReason[]
}

export interface PastDueSubscriptionInput {
  tenantId: string
  status: string | null
  paymentMethod: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  updatedAt: string | null
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
  /** Which of the three at-risk conditions this tenant met, in a stable order. */
  reasons: AtRiskReason[]
}

/**
 * Ranks two subscription rows for the same tenant; higher wins.
 *
 * `platform_subscriptions` carries `UNIQUE (tenant_id)` today and every write
 * path upserts on it, so a tenant cannot actually hold two rows — but the old
 * plain `.set()` over an unordered list meant that if the constraint were ever
 * relaxed (per-plan history, say), a stale `canceled` row could donate its
 * `payment_method` and `grace_period_end`, and therefore its countdown, to the
 * dashboard. Ranking explicitly costs nothing and removes the trap.
 */
function subscriptionRank(sub: PastDueSubscriptionInput): number {
  if (sub.status === 'past_due') return 2
  if (sub.status === 'active') return 1
  return 0
}

function isMoreRelevantSubscription(
  candidate: PastDueSubscriptionInput,
  incumbent: PastDueSubscriptionInput,
): boolean {
  const candidateRank = subscriptionRank(candidate)
  const incumbentRank = subscriptionRank(incumbent)
  if (candidateRank !== incumbentRank) return candidateRank > incumbentRank

  const candidateUpdated = candidate.updatedAt ? new Date(candidate.updatedAt).getTime() : null
  const incumbentUpdated = incumbent.updatedAt ? new Date(incumbent.updatedAt).getTime() : null
  if (candidateUpdated === null && incumbentUpdated === null) return false
  if (incumbentUpdated === null) return true
  if (candidateUpdated === null) return false
  return candidateUpdated > incumbentUpdated
}

function normalizeReasons(reasons: AtRiskReason[]): AtRiskReason[] {
  return REASON_ORDER.filter((reason) => reasons.includes(reason))
}

export function computeBillingHealth(
  tenants: AtRiskTenantInput[],
  subscriptions: PastDueSubscriptionInput[],
  now: Date,
): AtRiskTenant[] {
  const subByTenant = new Map<string, PastDueSubscriptionInput>()
  for (const sub of subscriptions) {
    const incumbent = subByTenant.get(sub.tenantId)
    if (!incumbent || isMoreRelevantSubscription(sub, incumbent)) {
      subByTenant.set(sub.tenantId, sub)
    }
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
      reasons: normalizeReasons(tenant.reasons),
    }
  })

  return results.sort((a, b) => {
    if (a.daysUntilDowngrade === null && b.daysUntilDowngrade === null) return 0
    if (a.daysUntilDowngrade === null) return 1
    if (b.daysUntilDowngrade === null) return -1
    return a.daysUntilDowngrade - b.daysUntilDowngrade
  })
}
