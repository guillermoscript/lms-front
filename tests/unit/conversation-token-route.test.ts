import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  resolveError: null as unknown,
  mintError: null as unknown,
  provider: 'openai',
  inserts: [] as unknown[],
  deletes: 0,
  updates: 0,
  mints: [] as unknown[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({
    user: { id: 'student' },
    tenantId: 'school',
    supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'student' } }) }) }) }) }) }) },
  }),
}))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => true }))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => true }))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => state.provider,
    getRealtime: async () => {
      if (state.resolveError) throw state.resolveError
      return {
        providerId: state.provider,
        modelId: 'school-realtime',
        voice: undefined,
        getToken: async (sessionConfig: unknown) => {
          if (state.mintError) throw state.mintError
          state.mints.push(sessionConfig)
          return { token: 'ephemeral', url: 'wss://provider', provider: state.provider, model: 'school-realtime', voice: 'marin' }
        },
      }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let mode = 'select'
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        lt: () => query,
        gte: () => query,
        update: () => { mode = 'update'; state.updates++; return query },
        delete: () => { mode = 'delete'; state.deletes++; return query },
        insert: (row: unknown) => { mode = 'insert'; state.inserts.push(row); return query },
        single: async () => (mode === 'insert'
          ? { data: { id: 99 }, error: null }
          : {
              error: null,
              data: {
                id: 7, title: 'Booking', instructions: 'Ask', system_prompt: null,
                exercise_type: 'real_time_conversation', course_id: 2, tenant_id: 'school',
                exercise_config: { scenario: 'Hotel', voice: 'marin', max_daily_attempts: 3 },
              },
            }),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ error: null, count: 0 }).then(resolve),
      }
      return query
    },
  }),
}))

import { POST } from '@/app/api/exercises/realtime/token/route'
import { AiKeyInvalidError, AiNotConfiguredError } from '@/lib/ai/errors'

const request = () => new Request('http://localhost/api/exercises/realtime/token?exerciseId=7&tab=tab-abcdefgh', { method: 'POST' })

beforeEach(() => {
  state.resolveError = null; state.mintError = null; state.provider = 'openai'
  state.inserts = []; state.deletes = 0; state.updates = 0; state.mints = []
})

describe('conversation token route (BYOK)', () => {
  it("mints with the school's realtime model and returns the descriptor, never a key", async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ token: 'ephemeral', provider: 'openai', model: 'school-realtime' })
    expect(Object.keys(body).sort()).toEqual(['model', 'provider', 'token', 'tools', 'url', 'voice'])
    expect(state.inserts).toHaveLength(1)
  })

  it('writes no pending row and abandons no session when the school has no key', async () => {
    state.resolveError = new AiNotConfiguredError('no_key', { feature: 'voice_conversation' })
    const response = await POST(request())
    expect(response.status).toBe(402)
    expect((await response.json()).error.code).toBe('ai_not_configured')
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toBe(0)
  })

  it('releases the attempt it opened when the provider refuses to mint', async () => {
    state.mintError = new AiKeyInvalidError({ providerId: 'openai', feature: 'voice_conversation' })
    const response = await POST(request())
    expect(response.status).toBe(424)
    expect(state.inserts).toHaveLength(1)
    expect(state.deletes).toBe(1)
  })

  it('sends the teacher voice only when the provider has it', async () => {
    await POST(request())
    expect((state.mints[0] as { voice?: string }).voice).toBe('marin')
    state.provider = 'google'
    await POST(request())
    expect((state.mints[1] as { voice?: string }).voice).toBeUndefined()
  })
})
