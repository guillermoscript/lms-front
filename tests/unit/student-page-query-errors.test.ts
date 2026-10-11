import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ failTable: null as string | null, hasEnrollment: false }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: async () => 'student-1', getCurrentTenantId: async () => 'tenant-1' }))
vi.mock('@/lib/services/course-access-guard', () => ({ requireCourseAccess: async () => undefined }))
vi.mock('@/lib/checkpoints/load', () => ({ getCheckpointLinkedExerciseIds: async () => new Set() }))
vi.mock('@/components/student/exercises-explorer', () => ({ ExercisesExplorer: () => null }))
vi.mock('@/components/student/exams-explorer', () => ({ ExamsExplorer: () => null }))
vi.mock('@/components/student/progress-explorer', () => ({ ProgressExplorer: () => null }))
vi.mock('@/components/student/certificates-explorer', () => ({ CertificatesExplorer: () => null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, is: () => query, in: () => query, order: () => query,
        single: async () => ({ data: { title: 'Learning Basics' }, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: table === state.failTable ? null : table === 'enrollments' && state.hasEnrollment
            ? [{ enrollment_id: 1, course_id: 7, courses: { title: 'Learning Basics' }, status: 'active' }]
            : [],
          error: table === state.failTable ? { message: 'Database unavailable' } : null,
        }).then(resolve),
      }
      return query
    },
  }),
}))

import CertificatesPage from '@/app/[locale]/dashboard/student/certificates/page'
import ExercisesPage from '@/app/[locale]/dashboard/student/courses/[courseId]/exercises/page'
import ExamsPage from '@/app/[locale]/dashboard/student/courses/[courseId]/exams/page'
import ProgressPage from '@/app/[locale]/dashboard/student/progress/page'

beforeEach(() => { state.failTable = null; state.hasEnrollment = false })

describe('student data failures remain distinct from empty lists', () => {
  it('does not claim there are no certificates when the query fails', async () => {
    state.failTable = 'certificates'
    await expect(CertificatesPage()).rejects.toThrow('Unable to load your certificates')
  })
  it('allows a genuine empty certificate list', async () => {
    await expect(CertificatesPage()).resolves.toBeTruthy()
  })
  it('does not claim there are no enrollments when the progress query fails', async () => {
    state.failTable = 'enrollments'
    await expect(ProgressPage()).rejects.toThrow('Unable to load your course progress')
  })
  it('does not turn a completion-query failure into zero progress', async () => {
    state.hasEnrollment = true
    state.failTable = 'lesson_completions'
    await expect(ProgressPage()).rejects.toThrow('Unable to load your course progress')
  })
  it('allows genuine empty progress', async () => {
    await expect(ProgressPage()).resolves.toBeTruthy()
  })
})

describe.each([{ table: 'exercises', page: ExercisesPage }, { table: 'exams', page: ExamsPage }])('student $table list', ({ table, page }) => {
  it('shows a retryable error instead of an empty list or missing page on query failure', async () => {
    state.failTable = table
    await expect(page({ params: Promise.resolve({ courseId: '7' }) })).rejects.toThrow(`Unable to load your ${table}`)
  })
  it('allows a genuine empty list', async () => {
    await expect(page({ params: Promise.resolve({ courseId: '7' }) })).resolves.toBeTruthy()
  })
})
