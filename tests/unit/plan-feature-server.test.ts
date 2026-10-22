import { describe, it, expect, vi } from 'vitest'
import {
  analyticsTierOf,
  certificateTierOf,
  planIncludes,
  getTenantPlan,
  PlanFeatureError,
  isPlanFeatureError,
  planFeatureErrorMessage,
  type TenantPlan,
} from '@/lib/plans/server'

const rows = vi.hoisted(() => ({ tenant: null as Record<string, unknown> | null, plans: [] as Record<string, unknown>[] }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let slug: unknown
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (_c: string, v: unknown) => {
          slug = v
          return b
        },
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'tenants' ? rows.tenant : rows.plans.find((p) => p.slug === slug) ?? null,
            error: null,
          }),
      }
      return b
    },
  }),
}))


const plan = (features: TenantPlan['features'], slug = 'free'): TenantPlan => ({ slug, name: null, features })

describe('planIncludes (#662)', () => {
  it('treats true and non-false strings as included', () => {
    expect(planIncludes(plan({ ai_grading: true }), 'ai_grading')).toBe(true)
    expect(planIncludes(plan({ analytics: 'basic' }), 'analytics')).toBe(true)
    expect(planIncludes(plan({ certificates: 'custom' }), 'certificates')).toBe(true)
  })
  it('is closed by default: missing, false, "false" and "" are excluded', () => {
    expect(planIncludes(plan({}), 'ai_grading')).toBe(false)
    expect(planIncludes(plan({ ai_grading: false }), 'ai_grading')).toBe(false)
    expect(planIncludes(plan({ analytics: 'false' }), 'analytics')).toBe(false)
    expect(planIncludes(plan({ analytics: '' }), 'analytics')).toBe(false)
  })
})

describe('tiers', () => {
  it('maps analytics values', () => {
    expect(analyticsTierOf(plan({}))).toBe('none')
    expect(analyticsTierOf(plan({ analytics: false }))).toBe('none')
    expect(analyticsTierOf(plan({ analytics: 'basic' }))).toBe('basic')
    expect(analyticsTierOf(plan({ analytics: true }))).toBe('basic')
    expect(analyticsTierOf(plan({ analytics: 'advanced' }))).toBe('advanced')
  })
  it('maps certificate values', () => {
    expect(certificateTierOf(plan({}))).toBe('none')
    expect(certificateTierOf(plan({ certificates: 'basic' }))).toBe('basic')
    expect(certificateTierOf(plan({ certificates: 'custom' }))).toBe('custom')
    expect(certificateTierOf(plan({ certificates: true }))).toBe('custom')
  })
})

describe('PlanFeatureError', () => {
  it('carries feature and plans, and is recognisable after serialisation', () => {
    const err = new PlanFeatureError('ai_grading', 'free', 'pro')
    expect(err.message).toBe('plan_feature_required:ai_grading')
    expect(isPlanFeatureError(err)).toBe(true)
    expect(isPlanFeatureError({ code: 'PLAN_FEATURE_REQUIRED' })).toBe(true)
    expect(isPlanFeatureError(new Error('nope'))).toBe(false)
    expect(planFeatureErrorMessage(err)).toBe('This feature requires the Pro plan or higher. Upgrade your plan to unlock it.')
  })
})

describe('getTenantPlan: missing platform_plans row by billing_mode', () => {
  const enterprise = { slug: 'enterprise', name: 'Enterprise', features: { ai_grading: true, analytics: 'advanced' } }
  let n = 0
  const resolve = async (tenant: Record<string, unknown>, plans: Record<string, unknown>[]) => {
    rows.tenant = tenant
    rows.plans = plans
    // react `cache` memoises per id outside a request: use a fresh id each time
    return getTenantPlan(`t-${++n}`)
  }

  it('paid + missing row stays closed', async () => {
    const plan = await resolve({ plan: 'ghost', billing_mode: 'paid' }, [enterprise])
    expect(plan.features).toEqual({})
    expect(plan.slug).toBe('ghost')
  })
  it.each(['comped', 'internal'])('%s + missing row uses the enterprise plan', async (mode) => {
    const plan = await resolve({ plan: 'ghost', billing_mode: mode }, [enterprise])
    expect(planIncludes(plan, 'ai_grading')).toBe(true)
  })
  it('comped with an existing row keeps its own plan', async () => {
    const plan = await resolve({ plan: 'starter', billing_mode: 'comped' }, [
      enterprise,
      { slug: 'starter', name: 'Starter', features: {} },
    ])
    expect(plan.name).toBe('Starter')
    expect(planIncludes(plan, 'ai_grading')).toBe(false)
  })
})
