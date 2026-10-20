/**
 * `tenants.billing_mode` — whether the platform billing machinery applies to a school.
 * Design: docs/INTERNAL_COMPED_SCHOOLS.md. The plan (tenants.plan) still decides
 * features/limits; the mode only decides which billing guards run.
 *
 *   paid     everything applies (default)
 *   comped   free plan for a partner: no subscription expiry/dunning/upsell, pays
 *            fee_percent_override (0 if null) on student sales, fee is notify-only.
 *            Plan limits still apply (plan stays the plan).
 *   internal platform owner's own school: never charged, never cut off, no fee.
 */
export const BILLING_MODES = ['paid', 'comped', 'internal'] as const
export type BillingMode = (typeof BILLING_MODES)[number]

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === 'string' && (BILLING_MODES as readonly string[]).includes(value)
}

/** Unknown / null (e.g. a row selected before the column existed) is treated as `paid`. */
export function normalizeBillingMode(value: unknown): BillingMode {
  return isBillingMode(value) ? value : 'paid'
}

/** Subscription expiry cron, dunning emails, past-due state, upgrade/upsell banners. */
export function subscriptionLifecycleApplies(mode: BillingMode): boolean {
  return mode === 'paid'
}

/** Over-limit access cutoff. Only `internal` is exempt (a comped school on a lowered plan is cut off like anyone). */
export function accessCutoffApplies(mode: BillingMode): boolean {
  return mode !== 'internal'
}

/** Fee-ledger *sales blocking*. `comped` is notify-only forever, `internal` has nothing to block. */
export function feeBlockingApplies(mode: BillingMode): boolean {
  return mode === 'paid'
}

/** Fee statements / reminders. `internal` owes nothing so nothing is sent. */
export function feeNoticesApply(mode: BillingMode): boolean {
  return mode !== 'internal'
}
