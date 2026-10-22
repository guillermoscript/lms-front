import { describe, it, expect, vi, beforeEach } from 'vitest'

const notifyMember = vi.fn(async (..._a: unknown[]) => false)
vi.mock('@/lib/notifications/member-notice', () => ({ notifyMember: (...a: unknown[]) => notifyMember(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: async () => true }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => 't1',
  getCurrentUserId: async () => 'admin1',
}))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoffSafely: async () => {} }))
vi.mock('@/app/actions/teacher/courses', () => ({ checkCourseLimit: async () => ({ canCreate: true }) }))
vi.mock('@/lib/billing/plan-limit-error', () => ({ courseLimitMessage: () => '', isPlanLimitError: () => false }))

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  verifyAdminAccess: async () => {},
  createAdminClient: () => ({ from }),
}))

import { approveCourse, archiveCourse, restoreCourse } from '@/app/actions/admin/courses'

beforeEach(() => {
  notifyMember.mockClear()
  from.mockReset()
  from.mockImplementation((table: string) => {
    if (table === 'notifications') throw new Error('must not insert into notifications directly')
    const chain: Record<string, unknown> = {}
    for (const m of ['update', 'select', 'eq']) chain[m] = () => chain
    chain.single = async () => ({ data: { title: 'Algebra', author_id: 'teacher1' }, error: null })
    return chain
  })
})

describe('admin course actions notify the author via notifyMember', () => {
  it.each([
    ['approveCourse', () => approveCourse(7), 'courseApproved'],
    ['archiveCourse', () => archiveCourse(7, 'outdated'), 'courseArchived'],
    ['restoreCourse', () => restoreCourse(7), 'courseRestored'],
  ])('%s', async (_n, run, kind) => {
    const res = await run()
    expect(res).toEqual({ success: true })
    expect(notifyMember).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        userId: 'teacher1',
        actorId: 'admin1',
        kind,
        courseTitle: 'Algebra',
        link: '/dashboard/teacher/courses/7',
      })
    )
  })

  it('succeeds even when the notice could not be written (helper returned false)', async () => {
    notifyMember.mockResolvedValueOnce(false)
    expect(await approveCourse(7)).toEqual({ success: true })
  })
})
