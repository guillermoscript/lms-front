export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  CANCELED: 'canceled',
  REFUNDED: 'refunded',
} as const

export type TransactionStatus = typeof TRANSACTION_STATUS[keyof typeof TRANSACTION_STATUS]

export const ENROLLMENT_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const

export type EnrollmentStatus = typeof ENROLLMENT_STATUS[keyof typeof ENROLLMENT_STATUS]

export const COURSE_STATUS = {
  PUBLISHED: 'published',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
} as const

export type CourseStatus = typeof COURSE_STATUS[keyof typeof COURSE_STATUS]

export const TENANT_ROLE = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
} as const

export type TenantRole = typeof TENANT_ROLE[keyof typeof TENANT_ROLE]

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  RENEWED: 'renewed',
  PAST_DUE: 'past_due',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
} as const

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS]

/**
 * The statuses that mean the student still has this subscription (#545).
 *
 * `renewed` and `past_due` are as live as `active`: both grant access, both
 * block a parallel subscription, and cancelling must never *improve* a status.
 * Mirrors `BLOCKING_SUBSCRIPTION_STATUSES` in lib/payments/subscription-guard.ts
 * — the web and the native app must agree on what "has a plan" means.
 */
export const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.RENEWED,
  SUBSCRIPTION_STATUS.PAST_DUE,
]

export const DEFAULT_PASSING_SCORE = 70

export function computeCoinBalance(totalXp: number, totalCoinsSpent: number): number {
  return Math.floor(totalXp / 10) - totalCoinsSpent
}
