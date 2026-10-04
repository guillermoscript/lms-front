import { describe, it, expect } from 'vitest'
import {
  analyticsTierOf,
  certificateTierOf,
  planIncludes,
  PlanFeatureError,
  isPlanFeatureError,
  planFeatureErrorMessage,
  type TenantPlan,
} from '@/lib/plans/server'

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
