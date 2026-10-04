/**
 * Guards on `POST /api/exercises/evaluate` (#843).
 *
 * `exercise_completions` and `exercise_evaluations` are server-write-only, so
 * this route is the only way a text/code exercise earns credit. What is proven
 * here: the score always comes from the grader (never the request body), every
 * gate (auth, exercise scope, engine, course access, checkpoint, rate limit)
 * stops the caller BEFORE the grader is paid for, a failed grade writes
 * nothing, and the grading material never leaks back into the response.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, tenantId: 'tenant-1' } as { user: { id: string }; tenantId: string } | null,
  exercise: null as Record<string, unknown> | null,
  checkpoint: null as Record<string, unknown> | null,
  recentCount: 0,
  hasAccess: true,
  graderOutput: { score: 40, feedback: 'ok', strengths: ['a'], improvements: ['b'] } as unknown,
  graderThrows: false,
  completionUpsertRows: [{ id: 1 }] as Row[],
  inserts: [] as { table: string; values: unknown }[],
  upserts: [] as { table: string; values: unknown; options: unknown }[],
  filters: {} as Record<string, Record<string, unknown>>,
  generateCalls: [] as { system?: string; prompt?: string }[],
}))

function builder(table: string) {
  const applied: Record<string, unknown> = {}
  state.filters[table] = applied
  let mode: 'select' | 'count' | 'insert' | 'upsert' = 'select'
  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) mode = 'count'
      return b
    },
    eq: (column: string, value: unknown) => {
      applied[column] = value
      return b
    },
    gte: (column: string, value: unknown) => {
      applied[`${column}>=`] = value
      return b
    },
    limit: () => b,
    insert: (values: unknown) => {
      mode = 'insert'
      state.inserts.push({ table, values })
      return b
    },
    upsert: (values: unknown, options: unknown) => {
      mode = 'upsert'
      state.upserts.push({ table, values, options })
      return b
    },
    maybeSingle: () => {
      if (table === 'exercises') {
        const ex = state.exercise
        const match = ex && ex.id === applied.id && ex.tenant_id === applied.tenant_id
        return Promise.resolve({ data: match ? ex : null, error: null })
      }
      if (table === 'lesson_checkpoints') return Promise.resolve({ data: state.checkpoint, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    single: () => Promise.resolve({ data: { attempt_number: 3 }, error: null }),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      let result: unknown = { data: null, error: null }
      if (mode === 'count') result = { count: state.recentCount, error: null }
      if (mode === 'upsert') result = { data: state.completionUpsertRows, error: null }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return b
}

vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: () => Promise.resolve(state.auth),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

vi.mock('@/lib/services/course-access', () => ({
  hasCourseAccess: () => Promise.resolve(state.hasAccess),
}))

vi.mock('@/lib/ai/config', () => ({
  AI_MODELS: { grader: 'grader-model' },
  DEFAULT_PASSING_SCORE: 70,
}))

vi.mock('ai', () => ({
  Output: { object: (x: unknown) => x },
  generateText: vi.fn((args: { system?: string; prompt?: string }) => {
    state.generateCalls.push(args)
    if (state.graderThrows) return Promise.reject(new Error('model down'))
    return Promise.resolve({ output: state.graderOutput })
  }),
}))

vi.mock('@/lib/analytics/server', () => ({
  track: () => Promise.resolve(),
}))

import { POST } from '@/app/api/exercises/evaluate/route'

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: 'Write a sum function',
    instructions: 'Return a + b.',
    exercise_type: 'essay',
    exercise_config: { passing_score: 70 },
    course_id: 11,
    tenant_id: 'tenant-1',
    status: 'published',
    system_prompt: null,
    exercise_grading_secrets: null,
    ...overrides,
  }
}

function request(body: unknown) {
  return new Request('http://school.lvh.me/api/exercises/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const completionWrites = () =>
  [...state.inserts, ...state.upserts].filter((w) => w.table === 'exercise_completions')
const evaluationInserts = () => state.inserts.filter((w) => w.table === 'exercise_evaluations')

beforeEach(() => {
  state.auth = { user: { id: 'user-1' }, tenantId: 'tenant-1' }
  state.exercise = exercise()
  state.checkpoint = null
  state.recentCount = 0
  state.hasAccess = true
  state.graderOutput = { score: 40, feedback: 'ok', strengths: ['a'], improvements: ['b'] }
  state.graderThrows = false
  state.completionUpsertRows = [{ id: 1 }]
  state.inserts = []
  state.upserts = []
  state.filters = {}
  state.generateCalls = []
})

describe('POST /api/exercises/evaluate', () => {
  it('401s an unauthenticated caller', async () => {
    state.auth = null
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('ignores a client-sent score and records the grader\'s', async () => {
    state.graderOutput = { score: 40, feedback: 'nope', strengths: [], improvements: ['more'] }
    const res = await POST(request({ exerciseId: 7, content: 'my answer', score: 100, passed: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.score).toBe(40)
    expect(body.passed).toBe(false)
    expect(body.completed).toBe(false)
    expect(evaluationInserts()).toHaveLength(1)
    expect(evaluationInserts()[0].values).toMatchObject({
      exercise_id: 7,
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      engine_type: 'text',
      score: 40,
      passed: false,
    })
    expect(completionWrites()).toHaveLength(0)
  })

  describe('a passing coding challenge', () => {
    beforeEach(() => {
      state.exercise = exercise({ exercise_type: 'coding_challenge' })
      state.graderOutput = { score: 90, feedback: 'great', strengths: ['clean'], improvements: [] }
    })

    it('records the evaluation and a first completion', async () => {
      const res = await POST(request({ exerciseId: 7, content: 'function sum(a,b){return a+b}' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ score: 90, passed: true, completed: true, alreadyCompleted: false, attemptNumber: 3 })
      expect(evaluationInserts()[0].values).toMatchObject({ engine_type: 'code', score: 90, passed: true })
      expect(state.upserts).toEqual([
        {
          table: 'exercise_completions',
          values: { exercise_id: 7, user_id: 'user-1', completed_by: 'user-1', score: 90 },
          options: { onConflict: 'exercise_id,user_id', ignoreDuplicates: true },
        },
      ])
    })

    it('reports alreadyCompleted when the completion existed', async () => {
      state.completionUpsertRows = []
      const res = await POST(request({ exerciseId: 7, content: 'function sum(a,b){return a+b}' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.completed).toBe(true)
      expect(body.alreadyCompleted).toBe(true)
      expect(state.upserts).toHaveLength(1)
    })
  })

  it.each([
    ['missing', () => (state.exercise = null)],
    ['unpublished', () => (state.exercise = exercise({ status: 'draft' }))],
    ['in another tenant', () => (state.exercise = exercise({ tenant_id: 'tenant-2' }))],
  ])('404s an exercise that is %s, before grading', async (_label, setup) => {
    setup()
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Exercise not found' })
    expect(state.filters.exercises).toMatchObject({ id: 7, tenant_id: 'tenant-1' })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('400s an audio exercise (graded in its own flow)', async () => {
    state.exercise = exercise({ exercise_type: 'audio_evaluation' })
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'This exercise is graded in its own flow' })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('403s a caller without course access', async () => {
    state.hasAccess = false
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Not enrolled in this course' })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('409s an essay that is an enabled lesson checkpoint', async () => {
    state.checkpoint = { lesson_id: 55 }
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ checkpointLessonId: 55 })
    expect(state.filters.lesson_checkpoints).toMatchObject({ exercise_id: 7, tenant_id: 'tenant-1', is_enabled: true })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('429s the 11th evaluation within an hour', async () => {
    state.recentCount = 10
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ rateLimited: true })
    expect(state.filters.exercise_evaluations).toMatchObject({ exercise_id: 7, user_id: 'user-1', tenant_id: 'tenant-1' })
    expect(state.generateCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('500s and writes nothing when the grader fails', async () => {
    state.graderThrows = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(request({ exerciseId: 7, content: 'x' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Evaluation failed' })
    expect(state.inserts).toHaveLength(0)
    expect(state.upserts).toHaveLength(0)
  })

  it('feeds the secrets to the grader but never echoes them', async () => {
    state.exercise = exercise({
      exercise_config: { passing_score: 70 },
      exercise_grading_secrets: {
        config: { evaluation_criteria: 'SECRET-CRITERIA mentions recursion' },
        system_prompt: 'SECRET-SYSTEM-PROMPT',
      },
    })
    state.graderOutput = { score: 80, feedback: 'fine', strengths: [], improvements: [] }
    const res = await POST(request({ exerciseId: 7, content: 'STUDENT-ANSWER-XYZ' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(
      [
        'score',
        'passed',
        'feedback',
        'strengths',
        'improvements',
        'passingScore',
        'attemptNumber',
        'completed',
        'alreadyCompleted',
      ].sort()
    )
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('SECRET-CRITERIA')
    expect(raw).not.toContain('SECRET-SYSTEM-PROMPT')

    expect(state.generateCalls).toHaveLength(1)
    const { prompt, system } = state.generateCalls[0]
    expect(prompt).toMatch(/<submission>\s*STUDENT-ANSWER-XYZ\s*<\/submission>/)
    expect(prompt).toContain('SECRET-CRITERIA mentions recursion')
    expect(system).toContain('SECRET-SYSTEM-PROMPT')
  })
})
