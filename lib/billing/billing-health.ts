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
 * Because that union admits tenants whose billing is perfectly healthy, every
 * past-due-derived field (`pastDueSince`, `graceEndsAt`, `daysUntilDowngrade`,
 * `isEstimate`) is gated on the tenant actually being past due. Without that
 * gate a school that already lapsed to free keeps a stale
 * `platform_subscriptions.grace_period_end` — `downgradeTenantToFree()` sets
 * `status = 'canceled'` but never clears the grace stamp, and then schedules
 * the very cutoff that puts the tenant on this list — so it would report a
 * large negative countdown and sort *above* the schools that still have a
 * downgrade to avert.
 *
 * Two past-due paths write `tenants.billing_status = 'past_due'`, and they
 * carry different amounts of information:
 *  - manual (app/api/cron/expire-platform-subscriptions/route.ts)
 *    stamps a real `platform_subscriptions.grace_period_end` deadline —
 *    downgrade date is exact.
 *  - stripe (app/api/billing/webhook/[provider]/route.ts) has no local grace
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

/** A `tenants` row as read by any of the three at-risk queries. */
export interface AtRiskTenantRow {
  tenantId: string
  tenantName: string
  plan: string | null
  accessCutoffAt: string | null
}

export interface AtRiskTenantInput extends AtRiskTenantRow {
  reasons: AtRiskReason[]
}

/**
 * Merges the three at-risk populations into one deduplicated list, attaching
 * every reason each tenant qualified under.
 *
 * Kept pure and exported so the union — the part of #514 with the actual new
 * logic — is unit-testable without a database. `extraTenants` covers the
 * subscription-only case: a tenant whose `platform_subscriptions.status` is
 * `past_due` while `tenants.billing_status` says otherwise appears in neither
 * of the other two reads, so the caller fetches those rows separately.
 */
export function mergeAtRiskTenants(input: {
  pastDueTenants: AtRiskTenantRow[]
  cutoffTenants: AtRiskTenantRow[]
  subscriptionPastDueTenantIds: string[]
  extraTenants: AtRiskTenantRow[]
}): AtRiskTenantInput[] {
  const reasonsByTenant = new Map<string, Set<AtRiskReason>>()
  const addReason = (tenantId: string, reason: AtRiskReason) => {
    const existing = reasonsByTenant.get(tenantId)
    if (existing) existing.add(reason)
    else reasonsByTenant.set(tenantId, new Set([reason]))
  }

  const tenantById = new Map<string, AtRiskTenantRow>()
  for (const tenant of input.pastDueTenants) {
    tenantById.set(tenant.tenantId, tenant)
    addReason(tenant.tenantId, 'tenant_past_due')
  }
  for (const tenant of input.cutoffTenants) {
    tenantById.set(tenant.tenantId, tenant)
    addReason(tenant.tenantId, 'access_cutoff_scheduled')
  }
  for (const tenantId of input.subscriptionPastDueTenantIds) {
    addReason(tenantId, 'subscription_past_due')
  }
  for (const tenant of input.extraTenants) {
    if (!tenantById.has(tenant.tenantId)) tenantById.set(tenant.tenantId, tenant)
  }

  // A subscription id with no matching `tenants` row (deleted mid-read) is
  // dropped rather than rendered as a nameless row.
  return [...tenantById.values()].map((tenant) => ({
    ...tenant,
    reasons: normalizeReasons([...(reasonsByTenant.get(tenant.tenantId) ?? [])]),
  }))
}

export interface PastDueSubscriptionInput {
  tenantId: string
  status: string | null
  paymentProvider: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  updatedAt: string | null
}

export interface AtRiskTenant {
  tenantId: string
  tenantName: string
  plan: string | null
  paymentProvider: string | null
  pastDueSince: string | null
  graceEndsAt: string | null
  /**
   * Ceil'd days remaining before auto-downgrade; null when not computable
   * (Stripe, no grace data) or when the tenant is not past due at all.
   */
  daysUntilDowngrade: number | null
  /**
   * True when the tenant is past due but there is no fixed downgrade date to
   * report (Stripe-managed dunning). False for a tenant that is only on this
   * list because of a scheduled cutoff — it has no downgrade pending to
   * estimate.
   */
  isEstimate: boolean
  accessCutoffAt: string | null
  /** True once `accessCutoffAt` is in the past: access is already paused, not merely scheduled. */
  accessCutoffActive: boolean
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
 * `payment_provider` and `grace_period_end`, and therefore its countdown, to the
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
    const reasons = normalizeReasons(tenant.reasons)
    // Only a past-due tenant has a downgrade to count down to. A cutoff-only
    // tenant may still carry a subscription row with a long-expired
    // `grace_period_end`, and reporting that as runway would be a lie.
    const isPastDue =
      reasons.includes('tenant_past_due') || reasons.includes('subscription_past_due')

    const sub = subByTenant.get(tenant.tenantId) ?? null
    const paymentProvider = sub?.paymentProvider ?? null
    // `'manual'`, not `'manual_transfer'`: #601 folded the old two-value
    // `payment_method` enum into the 8-value provider slug the student half
    // already uses. This comparison kept the retired string for a commit, which
    // silently emptied every manual school's countdown while the unit tests —
    // whose fixtures also predated the fold — stayed green.
    const isManual = paymentProvider === 'manual'

    const graceEndsAt = isPastDue && isManual ? sub?.gracePeriodEnd ?? null : null
    const daysUntilDowngrade = graceEndsAt
      ? Math.ceil((new Date(graceEndsAt).getTime() - now.getTime()) / DAY_MS)
      : null

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      plan: tenant.plan,
      paymentProvider,
      pastDueSince: isPastDue ? sub?.currentPeriodEnd ?? null : null,
      graceEndsAt,
      daysUntilDowngrade,
      isEstimate: isPastDue && !isManual,
      accessCutoffAt: tenant.accessCutoffAt,
      accessCutoffActive: tenant.accessCutoffAt
        ? new Date(tenant.accessCutoffAt).getTime() <= now.getTime()
        : false,
      reasons,
    }
  })

  // Soonest downgrade first. Rows with no countdown (Stripe dunning, or
  // cutoff-only) fall to the back, ordered by soonest cutoff so that tail is
  // not arbitrary, then by name for a stable render across reloads.
  return results.sort((a, b) => {
    if (a.daysUntilDowngrade !== null && b.daysUntilDowngrade !== null) {
      return a.daysUntilDowngrade - b.daysUntilDowngrade
    }
    if (a.daysUntilDowngrade !== null) return -1
    if (b.daysUntilDowngrade !== null) return 1

    const aCutoff = a.accessCutoffAt ? new Date(a.accessCutoffAt).getTime() : Infinity
    const bCutoff = b.accessCutoffAt ? new Date(b.accessCutoffAt).getTime() : Infinity
    if (aCutoff !== bCutoff) return aCutoff - bCutoff
    return a.tenantName.localeCompare(b.tenantName)
  })
}
