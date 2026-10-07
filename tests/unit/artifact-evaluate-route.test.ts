/**
 * Guards on `POST /api/exercises/artifact/evaluate` under BYOK: the exercise AND
 * its course must both belong to the caller's tenant, and the school's own
 * grader is resolved before the attempt budget is touched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  exercise: null as Record<string, unknown> | null,
  resolveError: null as unknown,
  models: [] as unknown[],
  inserts: [] as { table: string; values: unknown }[],
  counted: false,
  generateCalls: 0,
}))

function builder(table: string) {
  let mode: 'select' | 'count' | 'insert' = 'select'
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => { if (opts?.head) mode = 'count'; return b },
    eq: () => b,
    gte: () => b,
    insert: (values: unknown) => { mode = 'insert'; state.inserts.push({ table, values }); return b },
    single: () => Promise.resolve(state.exercise ? { data: state.exercise, error: null } : { data: null, error: { message: 'none' } }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      if (mode === 'count') state.counted = true
      return Promise.resolve(mode === 'count' ? { count: 0, error: null } : { data: null, error: null }).then(resolve, reject)
    },
  }
  return b
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: () => Promise.resolve({ user: { id: 'user-1' }, tenantId: 'tenant-1', supabase: { from: builder } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: () => Promise.resolve(true) }))
vi.mock('@/lib/analytics/server', () => ({ track: () => Promise.resolve() }))
vi.mock('@/lib/exercises/record-completion', () => ({ recordExerciseCompletion: () => Promise.resolve({ created: true }) }))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => 'openai',
    getModelForFeature: async () => {
      if (state.resolveError) throw state.resolveError
      return { model: 'school-grader', providerId: 'openai', modelId: 'gpt-x' }
    },
  }),
}))
vi.mock('ai', () => ({
  generateText: async (args: { model: unknown }) => {
    state.generateCalls++
    state.models.push(args.model)
    return { text: JSON.stringify({ score: 90, feedback: 'ok' }) }
  },
}))

import { POST } from '@/app/api/exercises/artifact/evaluate/route'
import { AiNotConfiguredError } from '@/lib/ai/errors'

const exercise = (overrides: Record<string, unknown> = {}) => ({
  id: 7, title: 'Artifact', instructions: 'Do it', exercise_type: 'artifact', exercise_config: {},
  course_id: 11, tenant_id: 'tenant-1', courses: { tenant_id: 'tenant-1' }, exercise_grading_secrets: null,
  ...overrides,
})
const request = () => new Request('http://school.lvh.me/api/exercises/artifact/evaluate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exerciseId: 7, content: 'answer' }),
})

beforeEach(() => {
  state.exercise = exercise(); state.resolveError = null; state.models = []; state.inserts = []; state.counted = false; state.generateCalls = 0
})

describe('POST /api/exercises/artifact/evaluate', () => {
  it('grades with the school\'s own model', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(state.models).toEqual(['school-grader'])
  })

  it.each([
    ['the exercise row is in another tenant', { tenant_id: 'tenant-2' }],
    ['the course is in another tenant', { courses: { tenant_id: 'tenant-2' } }],
    ['the course is missing', { courses: null }],
  ])('404s when %s, before any AI work', async (_label, overrides) => {
    state.exercise = exercise(overrides)
    const res = await POST(request())
    expect(res.status).toBe(404)
    expect(state.generateCalls).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('402s a school without a key before the attempt budget, with no side effects', async () => {
    state.resolveError = new AiNotConfiguredError('no_key')
    const res = await POST(request())
    expect(res.status).toBe(402)
    expect((await res.json()).error).toMatchObject({ code: 'ai_not_configured', feature: 'exercise_grader' })
    expect(state.counted).toBe(false)
    expect(state.generateCalls).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })
})
