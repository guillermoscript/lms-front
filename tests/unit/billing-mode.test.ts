import { describe, it, expect } from 'vitest'
import {
  BILLING_MODES,
  accessCutoffApplies,
  feeBlockingApplies,
  feeNoticesApply,
  isBillingMode,
  normalizeBillingMode,
  subscriptionLifecycleApplies,
} from '@/lib/billing/billing-mode'

describe('billing-mode predicates', () => {
  it('normalizes unknown / null values to paid', () => {
    expect(normalizeBillingMode(undefined)).toBe('paid')
    expect(normalizeBillingMode(null)).toBe('paid')
    expect(normalizeBillingMode('free')).toBe('paid')
    expect(normalizeBillingMode('comped')).toBe('comped')
    expect(normalizeBillingMode('internal')).toBe('internal')
    expect(isBillingMode('paid')).toBe(true)
    expect(isBillingMode(3)).toBe(false)
  })

  it('subscription lifecycle applies to paid only', () => {
    expect(BILLING_MODES.filter(subscriptionLifecycleApplies)).toEqual(['paid'])
  })

  it('access cutoff exempts internal only', () => {
    expect(BILLING_MODES.filter(accessCutoffApplies)).toEqual(['paid', 'comped'])
  })

  it('fee blocking is paid only; fee notices skip internal', () => {
    expect(BILLING_MODES.filter(feeBlockingApplies)).toEqual(['paid'])
    expect(BILLING_MODES.filter(feeNoticesApply)).toEqual(['paid', 'comped'])
  })
})
