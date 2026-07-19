/**
 * Pure classifier for a platform plan change, used by the manual
 * (bank-transfer) flow to record a real `request_type` instead of the
 * hardcoded `'upgrade'` it used before #465.
 *
 * Tier is compared by `sort_order` (free = 0 … enterprise, as seeded in
 * `platform_plans`). A move to a higher-order plan is an `'upgrade'`; to a
 * lower-order plan a `'downgrade'`. When the tier is unchanged — an interval
 * switch on the same plan — the billed amount breaks the tie: paying more
 * (monthly → yearly) is treated as an `'upgrade'`, paying less a `'downgrade'`;
 * equal amounts default to `'upgrade'` (there is no downgrade-limit concern).
 */

export type PlanChangeType = 'upgrade' | 'downgrade'

export interface PlanChangeInput {
  currentSortOrder: number
  currentAmount: number
  targetSortOrder: number
  targetAmount: number
}

export interface PlanChangeClassification {
  requestType: PlanChangeType
  /** True when only the billing interval changes (same plan tier). */
  isIntervalOnly: boolean
}

export function classifyPlanChange(input: PlanChangeInput): PlanChangeClassification {
  const { currentSortOrder, currentAmount, targetSortOrder, targetAmount } = input

  const isIntervalOnly = currentSortOrder === targetSortOrder

  let requestType: PlanChangeType
  if (targetSortOrder > currentSortOrder) {
    requestType = 'upgrade'
  } else if (targetSortOrder < currentSortOrder) {
    requestType = 'downgrade'
  } else {
    requestType = targetAmount < currentAmount ? 'downgrade' : 'upgrade'
  }

  return { requestType, isIntervalOnly }
}
