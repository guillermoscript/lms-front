/**
 * F5 (exercises): a teacher regrades an AI-graded attempt, and a regraded
 * attempt becomes a graded_answer test expecting the teacher's score.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  attempt: null as Record<string, unknown> | null,
  caseCount: 0,
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; row: Record<string, unknown> }[],
  completions: [] as Record<string, unknown>[],
}))

function fakeClient() {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {}
      let inserted: Record<string, unknown> | null = null
      for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b
      b.maybeSingle = async () => ({ data: table === 'exercise_evaluations' ? state.attempt : null })
      b.insert = (row: Record<string, unknown>) => {
        state.inserts.push({ table, row })
        inserted = row
        return b
      }
      b.update = (row: Record<string, unknown>) => {
        state.updates.push({ table, row })
        return b
      }
      b.single = async () => ({ data: inserted ? { id: 'case-1', ...inserted } : null, error: null })
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve(table === 'ai_eval_cases' && !inserted ? { count: state.caseCount } : { data: null, error: null })
      return b
    },
  }
}

vi.mock('@/lib/ai/evals/route-auth', () => ({
  exerciseStaff: async () => ({
    supabase: fakeClient(),
    user: { id: 'teacher-1' },
    tenantId: 't1',
    role: 'teacher',
    exercise: { id: 5, exercise_type: 'essay' },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@/lib/ai/evals/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/evals/store')>('@/lib/ai/evals/store')
  return { ...actual, loadGradingExercise: async () => ({ passingScore: 70 }) }
})
vi.mock('@/lib/exercises/record-completion', () => ({
  recordExerciseCompletion: async (_c: unknown, args: Record<string, unknown>) => {
    state.completions.push(args)
    return { created: true, error: null }
  },
}))

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  state.attempt = { id: 9, user_id: 'student-1' }
  state.caseCount = 0
  state.inserts = []
  state.updates = []
  state.completions = []
})

describe('POST attempts/[evaluationId]/review', () => {
  const load = async () => (await import('@/app/api/teacher/exercises/[exerciseId]/attempts/[evaluationId]/review/route')).POST
  const params = { params: Promise.resolve({ exerciseId: '5', evaluationId: '9' }) }

  it('stores the regrade next to the AI score and completes a passing attempt, credited to the teacher', async () => {
    const res = await (await load())(post({ score: 85, feedback: 'Good argument.' }), params)
    expect(res.status).toBe(200)
    expect(state.updates[0].row).toMatchObject({ teacher_score: 85, teacher_passed: true, teacher_feedback: 'Good argument.', teacher_id: 'teacher-1' })
    expect(state.updates[0].row).not.toHaveProperty('score')
    expect(state.completions).toEqual([{ exerciseId: 5, userId: 'student-1', score: 85, completedBy: 'teacher-1' }])
  })

  it('does not complete (or uncomplete) on a failing regrade', async () => {
    const res = await (await load())(post({ score: 40 }), params)
    expect(res.status).toBe(200)
    expect(state.updates[0].row).toMatchObject({ teacher_score: 40, teacher_passed: false, teacher_feedback: null })
    expect(state.completions).toEqual([])
  })

  it('404s an attempt outside this exercise and tenant, and rejects a bad score', async () => {
    state.attempt = null
    expect((await (await load())(post({ score: 50 }), params)).status).toBe(404)
    state.attempt = { id: 9, user_id: 'student-1' }
    expect((await (await load())(post({ score: 101 }), params)).status).toBe(400)
    expect(state.updates).toEqual([])
  })
})

describe('POST evals/exercise/[id]/cases/from-attempt', () => {
  const load = async () => (await import('@/app/api/teacher/evals/exercise/[exerciseId]/cases/from-attempt/route')).POST
  const params = { params: Promise.resolve({ exerciseId: '5' }) }

  it("saves the answer expecting the teacher's score, with nothing about the student", async () => {
    state.attempt = { submission_text: 'Readability wins because…', submission_metadata: null, teacher_score: 62.4 }
    const res = await (await load())(post({ evaluation_id: 9, name: 'Teacher-graded answer' }), params)
    expect(res.status).toBe(201)
    const row = state.inserts[0].row
    expect(row).toMatchObject({
      target_type: 'exercise',
      target_id: 5,
      kind: 'graded_answer',
      source: 'submission',
      input: { content: 'Readability wins because…' },
      expected: { score: 62, tolerance: 10, passed: null, category: 'custom' },
    })
    expect(JSON.stringify(row)).not.toMatch(/student-1|evaluation/)
  })

  it('refuses an attempt that was not regraded or has no stored answer', async () => {
    state.attempt = { submission_text: 'x', submission_metadata: null, teacher_score: null }
    expect((await (await load())(post({ evaluation_id: 9, name: 'n' }), params)).status).toBe(409)
    state.attempt = { submission_text: null, submission_metadata: null, teacher_score: 80 }
    expect((await (await load())(post({ evaluation_id: 9, name: 'n' }), params)).status).toBe(409)
    expect(state.inserts).toEqual([])
  })

  it('respects the per-target case limit', async () => {
    state.attempt = { submission_text: 'x', submission_metadata: null, teacher_score: 80 }
    state.caseCount = 20
    const res = await (await load())(post({ evaluation_id: 9, name: 'n' }), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'case_limit' })
  })
})
