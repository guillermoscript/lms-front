import { describe, it, expect } from 'vitest'
import {
  PLAN_LIMIT_SQLSTATE,
  courseLimitMessage,
  isPlanLimitError,
  parsePlanLimitError,
} from '@/lib/billing/plan-limit-error'

/**
 * Issue #658 — every writer of `courses` / `tenant_users` maps the DB trigger's
 * SQLSTATE `LM001` to the existing upgrade copy. The mapper must recognise the
 * PostgREST error shape, an RPC error, and a plain `Error` re-thrown from one,
 * and nothing else.
 */
describe('parsePlanLimitError', () => {
  it('reads the resource from a PostgREST error carrying LM001', () => {
    expect(
      parsePlanLimitError({ code: PLAN_LIMIT_SQLSTATE, message: 'plan_limit_exceeded:courses', details: '', hint: '' })
    ).toBe('courses')
    expect(parsePlanLimitError({ code: 'LM001', message: 'plan_limit_exceeded:students' })).toBe('students')
  })

  it('falls back to the message when the code was lost in a re-throw', () => {
    expect(parsePlanLimitError(new Error('plan_limit_exceeded:courses'))).toBe('courses')
    expect(parsePlanLimitError(new Error('RPC failed: plan_limit_exceeded:students'))).toBe('students')
  })

  it('returns null when the code matches but the resource cannot be read', () => {
    expect(parsePlanLimitError({ code: 'LM001', message: 'rewritten upstream' })).toBeNull()
  })

  it('ignores every other error', () => {
    expect(parsePlanLimitError(null)).toBeNull()
    expect(parsePlanLimitError('plan_limit_exceeded:courses')).toBeNull()
    expect(parsePlanLimitError({ code: '23505', message: 'duplicate key value' })).toBeNull()
    expect(parsePlanLimitError(new Error('permission denied for table courses'))).toBeNull()
  })
})

describe('isPlanLimitError', () => {
  it('is true for the code alone, the message alone, or both', () => {
    expect(isPlanLimitError({ code: 'LM001', message: 'anything' })).toBe(true)
    expect(isPlanLimitError(new Error('plan_limit_exceeded:students'))).toBe(true)
    expect(isPlanLimitError({ code: 'LM001', message: 'plan_limit_exceeded:courses' })).toBe(true)
  })

  it('is false for unrelated failures and non-objects', () => {
    expect(isPlanLimitError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isPlanLimitError(undefined)).toBe(false)
    expect(isPlanLimitError(42)).toBe(false)
  })
})

describe('courseLimitMessage', () => {
  it('matches the copy createCourse has always thrown', () => {
    expect(courseLimitMessage({ plan: 'free', limit: 5, currentCount: 5 })).toBe(
      'Your free plan is limited to 5 courses. You currently have 5 courses. Please upgrade your plan to create more courses.'
    )
  })
})
