import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the two NEW access-cutoff call sites added for issue #513:
 *   - joinCurrentSchool() (app/actions/join-school.ts) — after the tenant_users insert
 *   - createCourse() (app/actions/teacher/courses.ts) — after the courses insert
 *
 * Both go through `reconcileAccessCutoffSafely` and MUST be non-blocking: a
 * rejected reconcile must not fail the user's action. The mock below supplies a
 * faithful copy of that wrapper over a mocked `reconcileAccessCutoff`, so the
 * non-blocking assertions exercise the swallow rather than assume it.
 */

interface TestState {
  tenantId: string
  user: { id: string; email: string; user_metadata?: Record<string, unknown> }
  role: 'student' | 'teacher' | 'admin'
  // join-school
  existingMembership: { id: string } | null
  tenantPlan: string
  planLimits: { max_students?: number; max_courses?: number }
  studentCount: number
  invitation: { id: string; role: string } | null
  insertTenantUserError: { message: string } | null
  gamificationError: { message: string } | null
  metaError: { message: string } | null
  // teacher/courses
  courseCount: number
  insertedCourse: { course_id: number } | null
  insertCourseError: { message: string } | null
}

const state: TestState = {
  tenantId: 't1',
  user: { id: 'user-1', email: 'student@test.com', user_metadata: { full_name: 'Test User' } },
  role: 'student',
  existingMembership: null,
  tenantPlan: 'free',
  planLimits: { max_students: 50, max_courses: 5 },
  studentCount: 0,
  invitation: null,
  insertTenantUserError: null,
  gamificationError: null,
  metaError: null,
  courseCount: 0,
  insertedCourse: { course_id: 42 },
  insertCourseError: null,
}

type Resp = { data?: unknown; error?: unknown; count?: number }

/**
 * Generic chainable + thenable query-builder mock, one instance per .from() call.
 * `mode` reflects the write operation (insert/upsert/update/delete) once one has
 * been called — a trailing `.select().single()` (e.g. `insert(...).select().single()`)
 * must NOT reset it back to 'select', so writes only ever move mode away from
 * 'select', never back.
 */
function makeBuilder(resolveFn: (mode: string, countMode: boolean) => Resp) {
  let mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let countMode = false
  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      countMode = !!opts?.count
      return b
    },
    insert: () => {
      mode = 'insert'
      return b
    },
    upsert: () => {
      mode = 'upsert'
      return b
    },
    update: () => {
      mode = 'update'
      return b
    },
    delete: () => {
      mode = 'delete'
      return b
    },
    eq: () => b,
    neq: () => b,
    is: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    single: () => Promise.resolve(resolveFn(mode, countMode)),
    maybeSingle: () => Promise.resolve(resolveFn(mode, countMode)),
    then: (resolve: (r: Resp) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resolveFn(mode, countMode)).then(resolve, reject),
  }
  return b
}

function makeRegularClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user }, error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
      refreshSession: () => Promise.resolve({ data: {}, error: null }),
    },
    from(table: string) {
      return makeBuilder((mode, countMode) => {
        if (table === 'tenant_users') {
          return {
            data: state.existingMembership,
            error: state.existingMembership ? null : { message: 'no rows' },
          }
        }
        if (table === 'tenants') {
          return { data: { plan: state.tenantPlan, name: 'Test School' }, error: null }
        }
        if (table === 'platform_plans') {
          return { data: { limits: state.planLimits }, error: null }
        }
        if (table === 'courses') {
          if (countMode) return { data: null, error: null, count: state.courseCount }
          return { data: null, error: null }
        }
        return { data: null, error: null }
      })
    },
  }
}

function makeAdminClient() {
  return {
    from(table: string) {
      return makeBuilder((mode, countMode) => {
        if (table === 'tenants') {
          return { data: { plan: state.tenantPlan, name: 'Test School' }, error: null }
        }
        if (table === 'platform_plans') {
          return { data: { limits: state.planLimits }, error: null }
        }
        if (table === 'tenant_users') {
          if (mode === 'insert') return { data: null, error: state.insertTenantUserError }
          if (countMode) return { data: null, error: null, count: state.studentCount }
          return { data: null, error: null }
        }
        if (table === 'tenant_invitations') {
          if (mode === 'update') return { data: null, error: null }
          return {
            data: state.invitation,
            error: state.invitation ? null : { message: 'no rows' },
          }
        }
        if (table === 'gamification_profiles') {
          return { data: null, error: state.gamificationError }
        }
        if (table === 'profiles') {
          return { data: null, error: null }
        }
        if (table === 'courses') {
          if (mode === 'insert') {
            return {
              data: state.insertCourseError ? null : state.insertedCourse,
              error: state.insertCourseError,
            }
          }
          // `checkCourseLimit` counts through `countTenantUsage`, which runs on
          // the admin client (lib/billing/plan-limits.ts).
          if (countMode) return { data: null, error: null, count: state.courseCount }
          return { data: null, error: null }
        }
        return { data: null, error: null }
      })
    },
    auth: {
      admin: {
        updateUserById: () => Promise.resolve({ error: state.metaError }),
        getUserById: () =>
          Promise.resolve({
            data: { user: { email: state.user.email, user_metadata: state.user.user_metadata } },
            error: null,
          }),
      },
    },
  }
}

// `reconcileAccessCutoffSafely` is reproduced here rather than stubbed, so the
// non-blocking tests below exercise a real swallow of a real rejection instead
// of asserting that a no-op mock does nothing. Mirrors the implementation in
// lib/billing/access-cutoff.ts.
vi.mock('@/lib/billing/access-cutoff', () => {
  const reconcileAccessCutoff = vi.fn()
  return {
    reconcileAccessCutoff,
    reconcileAccessCutoffSafely: async (admin: unknown, tenantId: string) => {
      try {
        await reconcileAccessCutoff(admin, tenantId)
      } catch (err) {
        console.error('reconcileAccessCutoffSafely: reconcile failed for tenant', tenantId, err)
      }
    },
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeRegularClient()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(state.tenantId),
  getCurrentUserId: () => Promise.resolve(state.user.id),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve(state.role) }))

import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'
import { joinCurrentSchool } from '@/app/actions/join-school'
import { createCourse } from '@/app/actions/teacher/courses'

const reconcileMock = vi.mocked(reconcileAccessCutoff)

beforeEach(() => {
  state.tenantId = 't1'
  state.user = { id: 'user-1', email: 'student@test.com', user_metadata: { full_name: 'Test User' } }
  state.role = 'student'
  state.existingMembership = null
  state.tenantPlan = 'free'
  state.planLimits = { max_students: 50, max_courses: 5 }
  state.studentCount = 0
  state.invitation = null
  state.insertTenantUserError = null
  state.gamificationError = null
  state.metaError = null
  state.courseCount = 0
  state.insertedCourse = { course_id: 42 }
  state.insertCourseError = null

  reconcileMock.mockReset()
  reconcileMock.mockResolvedValue({ action: 'none' })
})

describe('joinCurrentSchool — reconcileAccessCutoff wiring (#513)', () => {
  it('calls reconcileAccessCutoff once with the tenant id after a successful join', async () => {
    const result = await joinCurrentSchool()

    expect(result).toEqual({ success: true })
    expect(reconcileMock).toHaveBeenCalledTimes(1)
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 't1')
  })

  it('is non-blocking: a rejected reconcileAccessCutoff does not fail the join', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reconcileMock.mockRejectedValue(new Error('reconcile boom'))

    const result = await joinCurrentSchool()

    expect(result).toEqual({ success: true })
    expect(reconcileMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'reconcileAccessCutoffSafely: reconcile failed for tenant',
      't1',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })
})

describe('createCourse — reconcileAccessCutoff wiring (#513)', () => {
  it('calls reconcileAccessCutoff once with the tenant id after a successful course creation', async () => {
    state.role = 'teacher'

    const result = await createCourse({ title: 'New Course' })

    expect(result).toEqual(state.insertedCourse)
    expect(reconcileMock).toHaveBeenCalledTimes(1)
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 't1')
  })

  it('is non-blocking: a rejected reconcileAccessCutoff does not fail course creation', async () => {
    state.role = 'teacher'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reconcileMock.mockRejectedValue(new Error('reconcile boom'))

    const result = await createCourse({ title: 'New Course' })

    expect(result).toEqual(state.insertedCourse)
    expect(reconcileMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'reconcileAccessCutoffSafely: reconcile failed for tenant',
      't1',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })
})
