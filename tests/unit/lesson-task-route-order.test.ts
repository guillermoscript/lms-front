import { beforeEach, describe, expect, it, vi } from 'vitest'

// Check order contract: auth -> access -> role -> resolve model -> rate limit -> side effects.
// A school with no AI key must produce a typed 402 and leave no trace.
const state = vi.hoisted(() => ({
  role: 'student' as string,
  resolveError: null as unknown,
  limiter: vi.fn(),
  usage: vi.fn(),
  insert: vi.fn(),
  persist: vi.fn(),
  stream: vi.fn(),
  resolved: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({
    user: { id: 'u1' },
    tenantId: 'tenant-a',
    supabase: {
      from: (table: string) => {
        if (table === 'tenant_users') {
          const q: Record<string, unknown> = {}
          q.select = () => q
          q.eq = () => q
          q.maybeSingle = async () => ({ data: { role: state.role } })
          return q
        }
        return { insert: state.insert }
      },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: { role: state.role } })
      return q
    },
  }),
}))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: async () => 'tenant-a' }))
vi.mock('@/lib/ai/chat-helpers', () => ({
  capChatHistory: (m: unknown[]) => m,
  lastUserMessageText: () => 'hello',
  fetchTenantLesson: async () => ({ title: 'L', course_id: 1, lessons_ai_tasks: null, course: { tenant_id: 'tenant-a' } }),
}))
vi.mock('@/lib/ai/attachments', () => ({
  sanitizeLastUserAttachments: (m: unknown[]) => m,
  lastUserMessageHasAttachments: () => false,
  persistLastUserAttachments: async () => { state.persist(); return [] },
}))
vi.mock('@/lib/rate-limit', () => ({
  AI_CHAT_TURNS_PER_MINUTE: 10,
  aiChatLimiter: { check: async () => { state.limiter() } },
}))
vi.mock('@/lib/ai/chat-usage', () => ({
  checkAiChatUsage: async () => { state.usage(); return { allowed: true } },
  aiChatRateLimitedResponse: () => new Response('', { status: 429 }),
  aiChatUsageLimitResponse: () => new Response('', { status: 429 }),
}))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => 'openai',
    getModelForFeature: async (feature: string) => {
      state.resolved.push(feature)
      if (state.resolveError) throw state.resolveError
      return { model: 'm', providerId: 'openai', modelId: 'gpt-x', feature }
    },
  }),
}))
vi.mock('ai', () => ({
  convertToModelMessages: async (m: unknown) => m,
  stepCountIs: () => ({}),
  tool: (t: unknown) => t,
  streamText: (opts: unknown) => {
    state.stream(opts)
    return { toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) }
  },
}))
vi.mock('@langfuse/tracing', () => ({ propagateAttributes: (_a: unknown, fn: () => unknown) => fn() }))

import { AiNotConfiguredError } from '@/lib/ai/errors'

const body = (extra: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/chat/lesson-task', {
    method: 'POST',
    body: JSON.stringify({ lessonId: 1, messages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }], ...extra }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  state.role = 'student'
  state.resolveError = null
  state.resolved = []
})

describe.each([
  ['/api/chat/lesson-task', () => import('@/app/api/chat/lesson-task/route'), 'student'],
  ['/api/teacher/preview/lesson-task', () => import('@/app/api/teacher/preview/lesson-task/route'), 'teacher'],
])('%s check order', (_name, load, role) => {
  it('no key -> 402 ai_not_configured, no limiter slot, no usage increment, no rows', async () => {
    state.role = role
    state.resolveError = new AiNotConfiguredError('no_key')
    const { POST } = await load()
    const res = await POST(body())
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.error).toMatchObject({ code: 'ai_not_configured', feature: 'lesson_tutor', canConfigure: false })
    expect(state.limiter).not.toHaveBeenCalled()
    expect(state.usage).not.toHaveBeenCalled()
    expect(state.persist).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
    expect(state.stream).not.toHaveBeenCalled()
  })

  it('admin gets the settings link', async () => {
    state.role = 'admin'
    state.resolveError = new AiNotConfiguredError('no_key')
    const { POST } = await load()
    const res = await POST(body())
    const json = await res.json()
    expect(json.error.canConfigure).toBe(true)
    expect(json.error.settingsUrl).toContain('/dashboard/admin/settings/ai')
  })

  it('resolves tutor and verifier models before spending the budget, then streams', async () => {
    state.role = role
    const { POST } = await load()
    const res = await POST(body())
    expect(res.status).toBe(200)
    expect(state.resolved).toEqual(['lesson_tutor', 'lesson_verifier'])
    expect(state.limiter).toHaveBeenCalledTimes(1)
    expect(state.stream).toHaveBeenCalledTimes(1)
    expect((state.stream.mock.calls[0][0] as { model: string }).model).toBe('m')
  })
})

describe('preview role gate runs before model resolution', () => {
  it('a student gets 403 and no model is resolved', async () => {
    state.role = 'student'
    const { POST } = await import('@/app/api/teacher/preview/lesson-task/route')
    const res = await POST(body())
    expect(res.status).toBe(403)
    expect(state.resolved).toEqual([])
  })
})
