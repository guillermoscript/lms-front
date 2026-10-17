/**
 * Outbound webhook event catalog. The DB triggers in
 * 20261016140000_outbound_webhooks.sql (and later *outbound_webhooks*.sql) emit exactly these `type` strings; keep
 * the two in sync (tests/unit/webhooks.test.ts pins the list).
 */

export const SCHOOL_WEBHOOK_EVENTS = [
  'enrollment.created',
  'lesson.completed',
  'exam.submitted',
  'exam.graded',
  'payment.succeeded',
  'subscription.created',
  'subscription.status_changed',
  'member.joined',
  'certificate.issued',
  'entitlement.granted',
  'entitlement.revoked',
  'payment.failed',
  'payment.refunded',
  'payment_request.created',
  'payment_request.status_changed',
  'course.completed',
  'exam.passed',
  'exam.failed',
  'community.post.created',
  'community.comment.created',
  'community.content_reported',
  'invitation.created',
  'invitation.accepted',
  'member.status_changed',
  'member.role_changed',
  'course.published',
  'lesson.published',
  'certificate.revoked',
  'payout.created',
  'payout.status_changed',
  'billing.status_changed',
  'school.access_cutoff',
] as const

/** Platform-only: delivered to platform-wide endpoints, never to a school's. */
export const PLATFORM_ONLY_WEBHOOK_EVENTS = [
  'school.created',
  'school.plan_changed',
  'school.billing_status_changed',
  'platform_payment.requested',
  'platform_payment.status_changed',
  'platform_fee.statement_created',
  'platform_subscription.changed',
] as const

export const PLATFORM_WEBHOOK_EVENTS = [
  ...SCHOOL_WEBHOOK_EVENTS,
  ...PLATFORM_ONLY_WEBHOOK_EVENTS,
] as const

export type WebhookScope = 'school' | 'platform'

export const WEBHOOK_TEST_EVENT = 'webhook.test'

/** '*' subscribes to every event the scope can receive. */
export const WEBHOOK_WILDCARD = '*'

export function eventsForScope(scope: WebhookScope): readonly string[] {
  return scope === 'platform' ? PLATFORM_WEBHOOK_EVENTS : SCHOOL_WEBHOOK_EVENTS
}

/**
 * Validate a subscription list for a scope. Returns the cleaned, de-duplicated
 * list, or null when empty/unknown. '*' collapses everything else.
 */
export function normalizeSubscribedEvents(scope: WebhookScope, input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const allowed = new Set<string>(eventsForScope(scope))
  const out = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') return null
    if (raw === WEBHOOK_WILDCARD) return [WEBHOOK_WILDCARD]
    if (!allowed.has(raw)) return null
    out.add(raw)
  }
  return out.size > 0 ? [...out] : null
}
