/**
 * Exam grader test routes (F3): plan gate, question-id validation, case limit,
 * run preconditions, and that nothing key-shaped is ever in a response.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  plan: true,
  questions: [] as Record<string, unknown>[],
  caseCount: 0,
  inserts: [] as { table: string; row: unknown }[],
  filters: [] as { table: string; col: string; val: unknown }[],
  runInsert: { data: { id: 'run-1', status: 'queued', version_id: 'v1', created_at: 'now' }, error: null as null | { code: string } },
  runLimit: false,
  preview: vi.fn(),
  after: [] as (() => unknown)[],
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { state.after.push(fn) } }
})

vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => state.plan }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/ai/with-tenant-ai', () => ({
  withTenantAi: async (_o: unknown, fn: (ai: unknown) => Promise<Response>) =>
    fn({ getModelForFeature: async () => ({ providerId: 'mock', modelId: 'm', model: {} }) }),
}))
vi.mock('@/lib/ai/evals/runner', () => ({
  executeEvalRun: vi.fn(),
  freeStaleRuns: async () => {},
  runLimitReached: async () => state.runLimit,
}))
vi.mock('@/lib/ai/evals/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/evals/store')>('@/lib/ai/evals/store')
  return { ...actual, ensureExamGraderVersion: async () => 'v1' }
})
vi.mock('@/lib/exams/grade', async () => {
  const actual = await vi.importActual<typeof import('@/lib/exams/grade')>('@/lib/exams/grade')
  return { ...actual, previewExamGrading: (...a: unknown[]) => state.preview(...a) }
})

function fakeSupabase() {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {}
      let insert: unknown
      const result = () => {
        if (table === 'exam_questions') return { data: state.questions }
        if (table === 'ai_eval_cases') return insert ? { data: insert, error: null } : { count: state.caseCount, data: [] }
        if (table === 'ai_eval_runs') return state.runInsert
        return { data: null }
      }
      for (const m of ['select', 'eq', 'order', 'limit']) {
        b[m] = (...args: unknown[]) => {
          if (m === 'eq') state.filters.push({ table, col: String(args[0]), val: args[1] })
          return b
        }
      }
      b.insert = (row: unknown) => { state.inserts.push({ table, row }); insert = row; return b }
      b.single = async () => (table === 'ai_eval_runs' ? state.runInsert : { data: insert ? { id: 'case-1', ...(insert as object) } : null, error: null })
      b.then = (resolve: (v: unknown) => unknown) => resolve(result())
      return b
    },
  }
}

vi.mock('@/lib/ai/evals/route-auth', () => ({
  examStaff: async () => ({
    supabase: fakeSupabase(),
    user: { id: 'u1' },
    tenantId: 't1',
    role: 'teacher',
    exam: { id: 7, title: 'Final', course_id: 3 },
  }),
}))

import { POST as casePost } from '@/app/api/teacher/evals/exam/[examId]/cases/route'
import { POST as previewPost } from '@/app/api/teacher/evals/exam/[examId]/preview/route'
import { POST as runsPost } from '@/app/api/teacher/evals/exam/[examId]/runs/route'
import { ExamGraderIncompleteError } from '@/lib/exams/grade'

const params = { params: Promise.resolve({ examId: '7' }) }
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

const questions = [
  { question_id: 1, question_type: 'multiple_choice', points: 10, options: [{ option_id: 11 }] },
  { question_id: 3, question_type: 'free_text', points: 10, options: [] },
]
const newCase = (over: Record<string, unknown> = {}) => ({
  kind: 'graded_exam', name: 'n',
  input: { answers: { '1': '11', '3': 'x' } },
  expected: { questions: { '3': { points_earned: 7, is_correct: true } } },
  ...over,
})

beforeEach(() => {
  Object.assign(state, { plan: true, questions, caseCount: 0, inserts: [], filters: [], runLimit: false, after: [] })
  state.runInsert = { data: { id: 'run-1', status: 'queued', version_id: 'v1', created_at: 'now' }, error: null }
  state.preview.mockReset()
})

describe('POST cases', () => {
  it('saves a case pinned to the tenant and exam', async () => {
    const res = await casePost(post(newCase()), params)
    expect(res.status).toBe(201)
    const row = state.inserts.find((i) => i.table === 'ai_eval_cases')?.row as Record<string, unknown>
    expect(row).toMatchObject({ tenant_id: 't1', target_type: 'exam', target_id: 7, kind: 'graded_exam', source: 'teacher' })
    expect(state.filters).toContainEqual({ table: 'exam_questions', col: 'exams.tenant_id', val: 't1' })
  })

  it('400 unknown_question for answers or expectations outside the exam', async () => {
    let res = await casePost(post(newCase({ input: { answers: { '99': 'x' } } })), params)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unknown_question', question_id: '99' })
    res = await casePost(post(newCase({ expected: { questions: { '98': { points_earned: 1 } } } })), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unknown_question')
    expect(state.inserts).toHaveLength(0)
  })

  it('400 when the only expectations are on closed questions', async () => {
    const res = await casePost(post(newCase({ expected: { questions: { '1': { points_earned: 5 } } } })), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('no_ai_questions')
  })

  it('409 case_limit', async () => {
    state.caseCount = 20
    const res = await casePost(post(newCase()), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('case_limit')
  })

  it('400 for malformed bodies', async () => {
    expect((await casePost(post({ kind: 'graded_exam' }), params)).status).toBe(400)
  })
})

describe('POST preview', () => {
  it('402 plan_required below the plan, before anything is read', async () => {
    state.plan = false
    const res = await previewPost(post({ answers: { '3': 'x' } }), params)
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: 'plan_required' })
    expect(state.preview).not.toHaveBeenCalled()
  })

  it('400 unknown_question and 409 when the exam has no free text', async () => {
    expect((await previewPost(post({ answers: { '99': 'x' } }), params)).status).toBe(400)
    state.questions = [questions[0]]
    const res = await previewPost(post({ answers: { '1': '11' } }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('no_ai_questions')
  })

  it('returns the grader result untouched and writes nothing', async () => {
    const payload = { questions: [{ question_id: 3, question_type: 'free_text', auto: false, points_earned: 6, points_possible: 10, is_correct: true, feedback: 'ok' }], score: 60, overall_feedback: 'fine' }
    state.preview.mockResolvedValue(payload)
    const res = await previewPost(post({ answers: { '3': 'x' } }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(payload)
    expect(state.preview.mock.calls[0][0]).toMatchObject({ tenantId: 't1', examId: 7, answers: { '3': 'x' }, locale: 'en' })
    expect(state.inserts).toHaveLength(0)
  })

  it('502 grader_failed when the grader skips a question', async () => {
    state.preview.mockRejectedValue(new ExamGraderIncompleteError())
    const res = await previewPost(post({ answers: { '3': 'x' } }), params)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'grader_failed' })
  })
})

describe('POST runs', () => {
  it('402 plan_required, 409 no_ai_questions, 429 run_limit, 409 no_cases, in that order', async () => {
    state.plan = false
    expect((await runsPost(post({}), params)).status).toBe(402)
    state.plan = true

    state.questions = [questions[0]]
    let res = await runsPost(post({}), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('no_ai_questions')
    state.questions = questions

    state.runLimit = true
    expect((await runsPost(post({}), params)).status).toBe(429)
    state.runLimit = false

    res = await runsPost(post({}), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('no_cases')
  })

  it('202 with run_id and the estimated calls (3 repeats per case)', async () => {
    state.caseCount = 4
    const res = await runsPost(post({}), params)
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ run_id: 'run-1', estimated_model_calls: 12 })
    expect(state.inserts.find((i) => i.table === 'ai_eval_runs')?.row).toMatchObject({ tenant_id: 't1', target_type: 'exam', target_id: 7, version_id: 'v1' })
    expect(state.after).toHaveLength(1)
  })

  it('409 run_in_progress on the single-active-run index', async () => {
    state.caseCount = 1
    state.runInsert = { data: null as never, error: { code: '23505' } }
    const res = await runsPost(post({}), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('run_in_progress')
  })
})
