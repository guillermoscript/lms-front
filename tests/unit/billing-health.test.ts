import { describe, it, expect } from 'vitest'
import {
  computeBillingHealth,
  mergeAtRiskTenants,
  type AtRiskTenantRow,
} from '@/lib/billing/billing-health'

const NOW = new Date('2026-07-24T00:00:00.000Z')

const sub = (overrides: {
  tenantId: string
  status?: string | null
  paymentProvider?: string | null
  currentPeriodEnd?: string | null
  gracePeriodEnd?: string | null
  updatedAt?: string | null
}) => ({
  status: 'past_due',
  paymentProvider: null,
  currentPeriodEnd: null,
  gracePeriodEnd: null,
  updatedAt: null,
  ...overrides,
})

describe('computeBillingHealth', () => {
  it('manual with grace time remaining computes a positive countdown', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due'] }],
      [sub({
        tenantId: 't1',
        paymentProvider: 'manual',
        currentPeriodEnd: '2026-07-17T00:00:00.000Z',
        gracePeriodEnd: '2026-07-27T00:00:00.000Z',
      })],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBe(3)
    expect(result[0].isEstimate).toBe(false)
    expect(result[0].graceEndsAt).toBe('2026-07-27T00:00:00.000Z')
    expect(result[0].pastDueSince).toBe('2026-07-17T00:00:00.000Z')
  })

  it('does not treat the retired manual_transfer slug as manual', () => {
    // #601 folded `payment_method IN ('stripe','manual_transfer')` into the
    // 8-value `payment_provider` slug, where bank transfer is `'manual'`. Every
    // reader here kept comparing against `'manual_transfer'` for a commit, and
    // this suite did not notice because its own fixtures used the retired value
    // too — so a manual school's countdown silently became null while the tests
    // stayed green. Pinning the dead string means the fixtures can never drift
    // back into agreement with a bug.
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due'] }],
      [sub({
        tenantId: 't1',
        paymentProvider: 'manual_transfer',
        currentPeriodEnd: '2026-07-17T00:00:00.000Z',
        gracePeriodEnd: '2026-07-27T00:00:00.000Z',
      })],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].graceEndsAt).toBeNull()
    expect(result[0].isEstimate).toBe(true)
  })

  it('manual with grace already expired still reports a (negative/zero) countdown, not a crash', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due'] }],
      [sub({
        tenantId: 't1',
        paymentProvider: 'manual',
        currentPeriodEnd: '2026-07-01T00:00:00.000Z',
        gracePeriodEnd: '2026-07-08T00:00:00.000Z',
      })],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBeLessThanOrEqual(0)
    expect(result[0].isEstimate).toBe(false)
  })

  it('stripe past_due reports an estimate with no fabricated countdown', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't2', tenantName: 'School B', plan: 'pro', accessCutoffAt: null, reasons: ['tenant_past_due'] }],
      [sub({
        tenantId: 't2',
        paymentProvider: 'stripe',
        currentPeriodEnd: '2026-07-20T00:00:00.000Z',
        gracePeriodEnd: null,
      })],
      NOW,
    )
    expect(result[0].isEstimate).toBe(true)
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].graceEndsAt).toBeNull()
    expect(result[0].pastDueSince).toBe('2026-07-20T00:00:00.000Z')
  })

  it('past_due tenant with no subscription row surfaces with nulls, not a throw', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't3', tenantName: 'School C', plan: 'free', accessCutoffAt: null, reasons: ['tenant_past_due'] }],
      [],
      NOW,
    )
    expect(result).toHaveLength(1)
    expect(result[0].paymentProvider).toBeNull()
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].isEstimate).toBe(true)
  })

  it('sorts soonest downgrade first, with estimates/nulls last', () => {
    const result = computeBillingHealth(
      [
        { tenantId: 'stripe-tenant', tenantName: 'Stripe School', plan: 'pro', accessCutoffAt: null, reasons: ['tenant_past_due'] },
        { tenantId: 'far', tenantName: 'Far School', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due'] },
        { tenantId: 'soon', tenantName: 'Soon School', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due'] },
      ],
      [
        sub({ tenantId: 'stripe-tenant', paymentProvider: 'stripe' }),
        sub({ tenantId: 'far', paymentProvider: 'manual', gracePeriodEnd: '2026-08-10T00:00:00.000Z' }),
        sub({ tenantId: 'soon', paymentProvider: 'manual', gracePeriodEnd: '2026-07-25T00:00:00.000Z' }),
      ],
      NOW,
    )
    expect(result.map((r) => r.tenantId)).toEqual(['soon', 'far', 'stripe-tenant'])
  })

  it('passes through access_cutoff_at unchanged', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't1', tenantName: 'School A', plan: 'free', accessCutoffAt: '2026-08-01T00:00:00.000Z', reasons: ['tenant_past_due'] }],
      [],
      NOW,
    )
    expect(result[0].accessCutoffAt).toBe('2026-08-01T00:00:00.000Z')
  })

  // #514 §1 — a tenant whose subscription went past due without
  // `tenants.billing_status` being synced used to be invisible here.
  it('surfaces a subscription-only past-due tenant and labels the reason', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't4', tenantName: 'Drifted School', plan: 'pro', accessCutoffAt: null, reasons: ['subscription_past_due'] }],
      [sub({
        tenantId: 't4',
        paymentProvider: 'manual',
        currentPeriodEnd: '2026-07-10T00:00:00.000Z',
        gracePeriodEnd: '2026-07-30T00:00:00.000Z',
      })],
      NOW,
    )
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toEqual(['subscription_past_due'])
    expect(result[0].daysUntilDowngrade).toBe(6)
  })

  // #514 §2 — an over-limit tenant with healthy billing has a cutoff scheduled
  // but no subscription problem; it must still be listed.
  it('surfaces a cutoff-only tenant with healthy billing', () => {
    const result = computeBillingHealth(
      [{ tenantId: 't5', tenantName: 'Over Limit School', plan: 'starter', accessCutoffAt: '2026-08-07T00:00:00.000Z', reasons: ['access_cutoff_scheduled'] }],
      [sub({ tenantId: 't5', status: 'active', paymentProvider: 'manual', gracePeriodEnd: null })],
      NOW,
    )
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toEqual(['access_cutoff_scheduled'])
    expect(result[0].accessCutoffAt).toBe('2026-08-07T00:00:00.000Z')
    // No grace deadline on an active subscription, so no fabricated countdown.
    expect(result[0].daysUntilDowngrade).toBeNull()
  })

  it('keeps every reason a tenant qualified under, in a stable order', () => {
    const result = computeBillingHealth(
      [{
        tenantId: 't6',
        tenantName: 'Doubly At-Risk School',
        plan: 'starter',
        accessCutoffAt: '2026-08-01T00:00:00.000Z',
        // Deliberately out of canonical order.
        reasons: ['access_cutoff_scheduled', 'subscription_past_due', 'tenant_past_due'],
      }],
      [],
      NOW,
    )
    expect(result[0].reasons).toEqual([
      'tenant_past_due',
      'subscription_past_due',
      'access_cutoff_scheduled',
    ])
  })

  // #514 §3 — unreachable while `platform_subscriptions` carries
  // UNIQUE (tenant_id), but the ranking must not depend on result order.
  it('picks the current subscription row over a stale one regardless of input order', () => {
    const stale = sub({
      tenantId: 't7',
      status: 'canceled',
      paymentProvider: 'stripe',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      gracePeriodEnd: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    const current = sub({
      tenantId: 't7',
      status: 'past_due',
      paymentProvider: 'manual',
      currentPeriodEnd: '2026-07-15T00:00:00.000Z',
      gracePeriodEnd: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    })
    const tenants = [{ tenantId: 't7', tenantName: 'Multi-row School', plan: 'starter', accessCutoffAt: null, reasons: ['tenant_past_due' as const] }]

    for (const subs of [[stale, current], [current, stale]]) {
      const result = computeBillingHealth(tenants, subs, NOW)
      expect(result[0].paymentProvider).toBe('manual')
      expect(result[0].graceEndsAt).toBe('2026-07-29T00:00:00.000Z')
      expect(result[0].daysUntilDowngrade).toBe(5)
      expect(result[0].isEstimate).toBe(false)
    }
  })

  it('breaks a same-status tie on updated_at, newest wins', () => {
    const older = sub({
      tenantId: 't8',
      status: 'past_due',
      paymentProvider: 'stripe',
      gracePeriodEnd: null,
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
    const newer = sub({
      tenantId: 't8',
      status: 'past_due',
      paymentProvider: 'manual',
      gracePeriodEnd: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    })
    const tenants = [{ tenantId: 't8', tenantName: 'Tie School', plan: 'pro', accessCutoffAt: null, reasons: ['tenant_past_due' as const] }]

    for (const subs of [[older, newer], [newer, older]]) {
      const result = computeBillingHealth(tenants, subs, NOW)
      expect(result[0].paymentProvider).toBe('manual')
      expect(result[0].daysUntilDowngrade).toBe(4)
    }
  })

  // The union in #514 admits tenants whose billing is fine. `downgradeTenantToFree()`
  // sets status='canceled' but never clears grace_period_end, then schedules the very
  // cutoff that lists the tenant here — so this row shape is the common one, not exotic.
  it('does not report a downgrade countdown for a cutoff-only tenant carrying a stale grace stamp', () => {
    const result = computeBillingHealth(
      [{
        tenantId: 't9',
        tenantName: 'Lapsed School',
        plan: 'free',
        accessCutoffAt: '2026-08-07T00:00:00.000Z',
        reasons: ['access_cutoff_scheduled'],
      }],
      [sub({
        tenantId: 't9',
        status: 'canceled',
        paymentProvider: 'manual',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
        gracePeriodEnd: '2026-06-08T00:00:00.000Z',
        updatedAt: '2026-06-08T00:00:00.000Z',
      })],
      NOW,
    )
    expect(result[0].daysUntilDowngrade).toBeNull()
    expect(result[0].graceEndsAt).toBeNull()
    // "Past due since" must stay empty for a tenant that is not past due.
    expect(result[0].pastDueSince).toBeNull()
    // No downgrade pending, so nothing to estimate — not Stripe dunning.
    expect(result[0].isEstimate).toBe(false)
  })

  it('keeps a live past-due school above an already-downgraded cutoff-only one', () => {
    const result = computeBillingHealth(
      [
        {
          tenantId: 'lapsed',
          tenantName: 'Lapsed School',
          plan: 'free',
          accessCutoffAt: '2026-08-07T00:00:00.000Z',
          reasons: ['access_cutoff_scheduled'],
        },
        {
          tenantId: 'live',
          tenantName: 'Live School',
          plan: 'starter',
          accessCutoffAt: null,
          reasons: ['tenant_past_due'],
        },
      ],
      [
        sub({
          tenantId: 'lapsed',
          status: 'canceled',
          paymentProvider: 'manual',
          gracePeriodEnd: '2026-06-08T00:00:00.000Z',
        }),
        sub({
          tenantId: 'live',
          paymentProvider: 'manual',
          gracePeriodEnd: '2026-07-30T00:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(result.map((r) => r.tenantId)).toEqual(['live', 'lapsed'])
  })

  it('orders the no-countdown tail by soonest cutoff, then by name', () => {
    const cutoffOnly = (tenantId: string, tenantName: string, accessCutoffAt: string | null) => ({
      tenantId,
      tenantName,
      plan: 'free',
      accessCutoffAt,
      reasons: ['access_cutoff_scheduled' as const],
    })
    const result = computeBillingHealth(
      [
        cutoffOnly('none', 'Zeta School', null),
        cutoffOnly('late', 'Later School', '2026-09-01T00:00:00.000Z'),
        cutoffOnly('soon', 'Sooner School', '2026-07-26T00:00:00.000Z'),
      ],
      [],
      NOW,
    )
    expect(result.map((r) => r.tenantId)).toEqual(['soon', 'late', 'none'])
  })

  it('marks a cutoff already in the past as active, a future one as not', () => {
    const result = computeBillingHealth(
      [
        { tenantId: 'past', tenantName: 'Paused School', plan: 'free', accessCutoffAt: '2026-07-01T00:00:00.000Z', reasons: ['access_cutoff_scheduled'] },
        { tenantId: 'future', tenantName: 'Warned School', plan: 'free', accessCutoffAt: '2026-08-01T00:00:00.000Z', reasons: ['access_cutoff_scheduled'] },
      ],
      [],
      NOW,
    )
    const byId = new Map(result.map((r) => [r.tenantId, r]))
    expect(byId.get('past')!.accessCutoffActive).toBe(true)
    expect(byId.get('future')!.accessCutoffActive).toBe(false)
  })
})

describe('mergeAtRiskTenants', () => {
  const row = (tenantId: string, accessCutoffAt: string | null = null): AtRiskTenantRow => ({
    tenantId,
    tenantName: `School ${tenantId}`,
    plan: 'starter',
    accessCutoffAt,
  })

  it('unions the three populations without duplicating a tenant', () => {
    const merged = mergeAtRiskTenants({
      pastDueTenants: [row('a'), row('shared')],
      cutoffTenants: [row('shared', '2026-08-01T00:00:00.000Z'), row('c', '2026-08-02T00:00:00.000Z')],
      subscriptionPastDueTenantIds: ['shared', 'd'],
      extraTenants: [row('d')],
    })
    expect(merged.map((t) => t.tenantId).sort()).toEqual(['a', 'c', 'd', 'shared'])
  })

  it('accumulates every reason a tenant qualified under, in canonical order', () => {
    const [tenant] = mergeAtRiskTenants({
      pastDueTenants: [row('x')],
      cutoffTenants: [row('x', '2026-08-01T00:00:00.000Z')],
      subscriptionPastDueTenantIds: ['x'],
      extraTenants: [],
    })
    expect(tenant.reasons).toEqual([
      'tenant_past_due',
      'subscription_past_due',
      'access_cutoff_scheduled',
    ])
  })

  it('surfaces a subscription-only tenant from the extra fetch', () => {
    const merged = mergeAtRiskTenants({
      pastDueTenants: [],
      cutoffTenants: [],
      subscriptionPastDueTenantIds: ['drifted'],
      extraTenants: [row('drifted')],
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].reasons).toEqual(['subscription_past_due'])
  })

  it('drops a subscription whose tenant row could not be read', () => {
    const merged = mergeAtRiskTenants({
      pastDueTenants: [row('a')],
      cutoffTenants: [],
      subscriptionPastDueTenantIds: ['a', 'vanished'],
      extraTenants: [],
    })
    expect(merged.map((t) => t.tenantId)).toEqual(['a'])
  })

  it('does not let the cutoff read overwrite a past-due tenant row', () => {
    const merged = mergeAtRiskTenants({
      pastDueTenants: [row('a')],
      cutoffTenants: [{ ...row('a', '2026-08-01T00:00:00.000Z'), tenantName: 'School a' }],
      subscriptionPastDueTenantIds: [],
      extraTenants: [],
    })
    expect(merged[0].accessCutoffAt).toBe('2026-08-01T00:00:00.000Z')
    expect(merged[0].reasons).toEqual(['tenant_past_due', 'access_cutoff_scheduled'])
  })
})
