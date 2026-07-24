import { describe, it, expect } from 'vitest'
import { computeBillingHealth } from '@/lib/billing/billing-health'

const NOW = new Date('2026-07-24T00:00:00.000Z')

describe('computeBillingHealth', () => {
  it('manual_transfer with grace time remaining computes a positive countdown', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'starter', accessCutoffAt: null }],
      [{
        tenantId: 't1',
        paymentMethod: 'manual_transfer',
        currentPeriodEnd: '2026-07-17T00:00:00.000Z',
        gracePeriodEnd: '2026-07-27T00:00:00.000Z',
      }],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBe(3)
    expect(result[0].isEstimate).toBe(false)
    expect(result[0].graceEndsAt).toBe('2026-07-27T00:00:00.000Z')
    expect(result[0].pastDueSince).toBe('2026-07-17T00:00:00.000Z')
  })

  it('manual_transfer with grace already expired still reports a (negative/zero) countdown, not a crash', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'starter', accessCutoffAt: null }],
      [{
        tenantId: 't1',
        paymentMethod: 'manual_transfer',
        currentPeriodEnd: '2026-07-01T00:00:00.000Z',
        gracePeriodEnd: '2026-07-08T00:00:00.000Z',
      }],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBeLessThanOrEqual(0)
    expect(result[0].isEstimate).toBe(false)
  })

  it('stripe past_due reports an estimate with no fabricated countdown', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't2', tenantName: 'School B', plan: 'pro', accessCutoffAt: null }],
      [{
        tenantId: 't2',
        paymentMethod: 'stripe',
        currentPeriodEnd: '2026-07-20T00:00:00.000Z',
        gracePeriodEnd: null,
      }],
      NOW,
    )
    expect(result[0].isEstimate).toBe(true)
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].graceEndsAt).toBeNull()
    expect(result[0].pastDueSince).toBe('2026-07-20T00:00:00.000Z')
  })

  it('past_due tenant with no subscription row surfaces with nulls, not a throw', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't3', tenantName: 'School C', plan: 'free', accessCutoffAt: null }],
      [],
      NOW,
    )
    expect(result).toHaveLength(1)
    expect(result[0].paymentMethod).toBeNull()
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].isEstimate).toBe(true)
  })

  it('sorts soonest downgrade first, with estimates/nulls last', () => {
    const result = computeBillingHealth(
      [
        { tenantId: 'stripe-tenant', tenantName: 'Stripe School', plan: 'pro', accessCutoffAt: null },
        { tenantId: 'far', tenantName: 'Far School', plan: 'starter', accessCutoffAt: null },
        { tenantId: 'soon', tenantName: 'Soon School', plan: 'starter', accessCutoffAt: null },
      ],
      [
        { tenantId: 'stripe-tenant', paymentMethod: 'stripe', currentPeriodEnd: null, gracePeriodEnd: null },
        { tenantId: 'far', paymentMethod: 'manual_transfer', currentPeriodEnd: null, gracePeriodEnd: '2026-08-10T00:00:00.000Z' },
        { tenantId: 'soon', paymentMethod: 'manual_transfer', currentPeriodEnd: null, gracePeriodEnd: '2026-07-25T00:00:00.000Z' },
      ],
      NOW,
    )
    expect(result.map((r) => r.tenantId)).toEqual(['soon', 'far', 'stripe-tenant'])
  })

  it('passes through access_cutoff_at unchanged', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'free', accessCutoffAt: '2026-08-01T00:00:00.000Z' }],
      [],
      NOW,
    )
    expect(result[0].accessCutoffAt).toBe('2026-08-01T00:00:00.000Z')
  })
})
