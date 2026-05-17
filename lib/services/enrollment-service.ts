/**
 * Enrollment / Entitlement Service
 *
 * Centralized business logic for course access.
 *
 * Access model — see docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 * A user holds zero or more `entitlements` rows per course, one per access
 * source (product / subscription / free / admin_grant). The user has access
 * to a course if ANY entitlement is active and not expired. Sources coexist —
 * e.g. a perpetual product entitlement AND an expiring subscription
 * entitlement on the same course.
 *
 * Pure functions only — no DB calls. DB access lives in
 * lib/services/course-access.ts.
 */

export type EntitlementSourceType = 'product' | 'subscription' | 'free' | 'admin_grant'
export type EntitlementStatus = 'active' | 'revoked' | 'expired'

/** Shape of an `entitlements` row, limited to the columns the app reads. */
export interface EntitlementRow {
  entitlement_id?: number
  course_id?: number
  source_type: EntitlementSourceType
  source_id: number | null
  status: EntitlementStatus
  granted_at?: string
  expires_at: string | null
}

export interface CourseAccess {
  hasAccess: boolean
  /**
   * Primary source for display / back-compat: 'product' when any perpetual
   * (product/free/admin_grant) source is active, else 'subscription', else null.
   */
  accessType: 'product' | 'subscription' | null
  /** All distinct source types currently granting access. */
  accessTypes: EntitlementSourceType[]
  /** True when at least one active source never expires (product/free/admin_grant). */
  isPerpetual: boolean
  /** True when the user had access at some point but no source is active now. */
  isExpired: boolean
  productId?: number
  subscriptionId?: number
  subscriptionEndDate?: Date
}

const PERPETUAL_SOURCES: EntitlementSourceType[] = ['product', 'free', 'admin_grant']

function isEntitlementActive(e: EntitlementRow, now: number): boolean {
  return e.status === 'active'
    && (e.expires_at == null || new Date(e.expires_at).getTime() > now)
}

/**
 * Compute course access from a user's entitlement rows for a single course.
 * This is the single source of truth for "can this user open this course".
 */
export function computeCourseAccess(entitlements: EntitlementRow[]): CourseAccess {
  const now = Date.now()
  const active = entitlements.filter(e => isEntitlementActive(e, now))

  if (active.length === 0) {
    return {
      hasAccess: false,
      accessType: null,
      accessTypes: [],
      isPerpetual: false,
      // Had an entitlement once, none active now → expired / revoked.
      isExpired: entitlements.length > 0,
    }
  }

  const accessTypes = [...new Set(active.map(e => e.source_type))]
  const isPerpetual = active.some(e => PERPETUAL_SOURCES.includes(e.source_type))
  const productEnt = active.find(e => e.source_type === 'product')
  const subEnt = active
    .filter(e => e.source_type === 'subscription')
    .sort((a, b) =>
      new Date(b.expires_at ?? 0).getTime() - new Date(a.expires_at ?? 0).getTime())[0]

  return {
    hasAccess: true,
    accessType: isPerpetual ? 'product' : 'subscription',
    accessTypes,
    isPerpetual,
    isExpired: false,
    productId: productEnt?.source_id ?? undefined,
    subscriptionId: subEnt?.source_id ?? undefined,
    subscriptionEndDate: subEnt?.expires_at ? new Date(subEnt.expires_at) : undefined,
  }
}

/**
 * Check if the user should see a "Renew Subscription" CTA — i.e. they had
 * access but every source has lapsed.
 */
export function shouldShowRenewCTA(access: CourseAccess): boolean {
  return !access.hasAccess && access.isExpired
}

/**
 * Get badge configuration for course card display.
 */
export function getAccessBadge(access: CourseAccess): {
  text: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (access.hasAccess && access.isPerpetual) {
    return { text: 'Lifetime Access', variant: 'default' }
  }

  if (access.hasAccess && access.accessTypes.includes('subscription')) {
    return { text: 'Subscription', variant: 'secondary' }
  }

  if (access.isExpired) {
    return { text: 'Subscription Expired', variant: 'destructive' }
  }

  return { text: 'No Access', variant: 'outline' }
}

/**
 * Check if user has any active subscription.
 */
export function hasActiveSubscription(subscriptions: Array<{
  subscription_status: string
  end_date: string
}>): boolean {
  return subscriptions.some(sub =>
    sub.subscription_status === 'active' &&
    new Date(sub.end_date) > new Date()
  )
}

/**
 * Get the primary active subscription for display (longest-lasting).
 */
export function getPrimarySubscription(subscriptions: Array<{
  subscription_id: number
  subscription_status: string
  end_date: string
  plan?: {
    plan_name: string
  }
}>) {
  const active = subscriptions.filter(sub =>
    sub.subscription_status === 'active' &&
    new Date(sub.end_date) > new Date()
  )

  if (active.length === 0) return null

  return active.sort((a, b) =>
    new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
  )[0]
}
