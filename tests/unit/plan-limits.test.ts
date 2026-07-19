import { describe, it, expect } from 'vitest'
import {
  computePlanLimitViolations,
  checkPlanLimits,
  formatPlanLimitError,
  type PlanLimitCheckResult,
} from '@/lib/billing/plan-limits'

/**
 * Pins the plan-limit pre-flight check contract (issue #465): pure violation
 * comparison, the async usage/plan lookup (fail-open on no target / unknown
 * plan), and the human-readable error wording. Fluent fake Supabase client
 * modeled on tests/unit/platform-plan-change.test.ts.
 */

interface FakeConfig {
  plan?: { name: string; limits: { max_courses?: number; max_students?: number } | null } | null
  courseCount?: number
  studentCount?: number
}

interface Recorder {
  planEq: { col: string; val: unknown }[]
}

function makeFakeAdmin(cfg: FakeConfig) {
  const calls: Recorder = { planEq: [] }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      eq(col: string, val: unknown) {
        if (table === 'platform_plans') calls.planEq.push({ col, val })
        return builder
      },
      neq() {
        return builder
      },
      maybeSingle() {
        if (table === 'platform_plans') {
          return Promise.resolve({ data: cfg.plan ?? null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: unknown) => unknown) {
        if (table === 'courses') {
          return Promise.resolve({ count: cfg.courseCount ?? 0, error: null }).then(resolve)
        }
        if (table === 'tenant_users') {
          return Promise.resolve({ count: cfg.studentCount ?? 0, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
    }
    return builder
  }

  const admin = {
    from(table: string) {
      return makeBuilder(table)
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls }
}

describe('computePlanLimitViolations (pure)', () => {
  it('usage under both limits → no violations', () => {
    const violations = computePlanLimitViolations(
      { courses: 5, students: 50 },
      { max_courses: 15, max_students: 200 }
    )
    expect(violations).toEqual([])
  })

  it('over courses only', () => {
    const violations = computePlanLimitViolations(
      { courses: 20, students: 50 },
      { max_courses: 15, max_students: 200 }
    )
    expect(violations).toEqual([{ resource: 'courses', current: 20, max: 15, reduceBy: 5 }])
  })

  it('over students only', () => {
    const violations = computePlanLimitViolations(
      { courses: 5, students: 250 },
      { max_courses: 15, max_students: 200 }
    )
    expect(violations).toEqual([{ resource: 'students', current: 250, max: 200, reduceBy: 50 }])
  })

  it('over both courses and students', () => {
    const violations = computePlanLimitViolations(
      { courses: 20, students: 250 },
      { max_courses: 15, max_students: 200 }
    )
    expect(violations).toEqual([
      { resource: 'courses', current: 20, max: 15, reduceBy: 5 },
      { resource: 'students', current: 250, max: 200, reduceBy: 50 },
    ])
  })

  it('-1 (unlimited) never violates even with high usage', () => {
    const violations = computePlanLimitViolations(
      { courses: 100000, students: 100000 },
      { max_courses: -1, max_students: -1 }
    )
    expect(violations).toEqual([])
  })

  it('null limits → no violations', () => {
    const violations = computePlanLimitViolations({ courses: 100000, students: 100000 }, null)
    expect(violations).toEqual([])
  })

  it('missing max_students key → students treated as unlimited', () => {
    const violations = computePlanLimitViolations(
      { courses: 5, students: 100000 },
      { max_courses: 15 }
    )
    expect(violations).toEqual([])
  })
})

describe('checkPlanLimits (async)', () => {
  it('usage fits target plan → ok:true, no violations', async () => {
    const { admin } = makeFakeAdmin({
      plan: { name: 'Starter', limits: { max_courses: 15, max_students: 200 } },
      courseCount: 10,
      studentCount: 100,
    })
    const result = await checkPlanLimits(admin, 'tenant-1', { planId: 'starter-id' })
    expect(result.ok).toBe(true)
    expect(result.planName).toBe('Starter')
    expect(result.usage).toEqual({ courses: 10, students: 100 })
    expect(result.violations).toEqual([])
  })

  it('usage over target plan → ok:false with correct violations', async () => {
    const { admin } = makeFakeAdmin({
      plan: { name: 'Starter', limits: { max_courses: 15, max_students: 200 } },
      courseCount: 50,
      studentCount: 100,
    })
    const result = await checkPlanLimits(admin, 'tenant-1', { slug: 'starter' })
    expect(result.ok).toBe(false)
    expect(result.planName).toBe('Starter')
    expect(result.violations).toEqual([
      { resource: 'courses', current: 50, max: 15, reduceBy: 35 },
    ])
  })

  it('unknown plan (maybeSingle returns null) → fail-open ok:true, planName null', async () => {
    const { admin } = makeFakeAdmin({ plan: null, courseCount: 500, studentCount: 500 })
    const result = await checkPlanLimits(admin, 'tenant-1', { planId: 'unknown-id' })
    expect(result.ok).toBe(true)
    expect(result.planName).toBeNull()
    expect(result.violations).toEqual([])
  })

  it('neither planId nor slug provided → fail-open ok:true', async () => {
    const { admin } = makeFakeAdmin({ courseCount: 500, studentCount: 500 })
    const result = await checkPlanLimits(admin, 'tenant-1', {})
    expect(result.ok).toBe(true)
    expect(result.planName).toBeNull()
    expect(result.violations).toEqual([])
    expect(result.usage).toEqual({ courses: 500, students: 500 })
  })
})

describe('formatPlanLimitError', () => {
  it('returns null when ok', () => {
    const result: PlanLimitCheckResult = {
      ok: true,
      planName: 'Starter',
      usage: { courses: 10, students: 100 },
      violations: [],
    }
    expect(formatPlanLimitError(result)).toBeNull()
  })

  it('produces exact wording for both courses and students violations', () => {
    const result: PlanLimitCheckResult = {
      ok: false,
      planName: 'Starter',
      usage: { courses: 50, students: 250 },
      violations: [
        { resource: 'courses', current: 50, max: 15, reduceBy: 35 },
        { resource: 'students', current: 250, max: 200, reduceBy: 50 },
      ],
    }
    expect(formatPlanLimitError(result)).toBe(
      'You have 50 active courses but the Starter plan allows 15. Archive 35 course(s) before downgrading. ' +
        'You have 250 students but the Starter plan allows 200.'
    )
  })

  it('falls back to "target" when planName is null', () => {
    const result: PlanLimitCheckResult = {
      ok: false,
      planName: null,
      usage: { courses: 50, students: 100 },
      violations: [{ resource: 'courses', current: 50, max: 15, reduceBy: 35 }],
    }
    expect(formatPlanLimitError(result)).toBe(
      'You have 50 active courses but the target plan allows 15. Archive 35 course(s) before downgrading.'
    )
  })
})
