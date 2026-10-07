import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  getModelForFeature: vi.fn(),
  limiterCheck: vi.fn(async () => undefined),
  checkUsage: vi.fn(async () => ({ allowed: true })),
  sessionInserts: [] as unknown[],
  sessionUpdates: [] as Record<string, unknown>[],
  summary: vi.fn(),
  hasAccess: vi.fn(async () => true),
}))

vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({ getModelForFeature: m.getModelForFeature, lastProviderId: () => 'openai' }),
}))
vi.mock('@/lib/ai/aristotle-summary', () => ({ generateSessionSummary: m.summary }))
vi.mock('@/lib/rate-limit', () => ({ AI_CHAT_TURNS_PER_MINUTE: 10, aiChatLimiter: { check: m.limiterCheck } }))
vi.mock('@/lib/ai/chat-usage', () => ({
  checkAiChatUsage: m.checkUsage,
  aiChatRateLimitedResponse: () => new Response('rl', { status: 429 }),
  aiChatUsageLimitResponse: () => new Response('ul', { status: 429 }),
}))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: m.hasAccess }))
vi.mock('@/lib/analytics/server', () => ({ track: vi.fn() }))
vi.mock('@langfuse/tracing', () => ({ propagateAttributes: (_a: unknown, fn: () => unknown) => fn() }))

function chain(table: string, data: unknown) {
  const b: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'is', 'gte', 'not', 'order', 'limit', 'in']) b[k] = () => b
  b.single = async () => ({ data, error: null })
  b.maybeSingle = async () => ({ data, error: null })
  b.insert = (row: unknown) => {
    if (table === 'aristotle_sessions') m.sessionInserts.push(row)
    return b
  }
  b.update = (row: Record<string, unknown>) => {
    if (table === 'aristotle_sessions') m.sessionUpdates.push(row)
    return b
  }
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(res)
  return b
}

const tables: Record<string, unknown> = {}
const supabase = { from: (t: string) => chain(t, tables[t] ?? null) }

vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({ supabase, user: { id: 'u1' }, tenantId: '00000000-0000-0000-0000-000000000001' }),
}))

import { AiNotConfiguredError } from '@/lib/ai/errors'

const req = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  m.sessionInserts.length = 0
  m.sessionUpdates.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
})

describe('aristotle chat route without a key', () => {
  it('answers 402 ai_not_configured and leaves no side effects', async () => {
    tables.course_ai_tutors = { enabled: true }
    m.getModelForFeature.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'aristotle' }))
    const { POST } = await import('@/app/api/chat/aristotle/route')
    const res = await POST(req({ messages: [], courseId: 5 }))
    expect(res.status).toBe(402)
    expect((await res.json()).error.code).toBe('ai_not_configured')
    expect(m.limiterCheck).not.toHaveBeenCalled()
    expect(m.checkUsage).not.toHaveBeenCalled()
    expect(m.sessionInserts).toHaveLength(0)
  })

  it('requires vision only when the last user message has attachments', async () => {
    tables.course_ai_tutors = { enabled: true }
    m.getModelForFeature.mockRejectedValue(new AiNotConfiguredError('no_key'))
    const { POST } = await import('@/app/api/chat/aristotle/route')
    await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], courseId: 5 }))
    expect(m.getModelForFeature).toHaveBeenLastCalledWith('aristotle', { courseId: 5, require: undefined })
  })
})

describe('aristotle restart route without a key', () => {
  it('closes the session with summary=null instead of failing', async () => {
    tables.aristotle_sessions = { session_id: 's1' }
    tables.aristotle_messages = [{ role: 'user', content: 'hello' }]
    m.getModelForFeature.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'aristotle_summary' }))
    const { POST } = await import('@/app/api/chat/aristotle/restart/route')
    const res = await POST(req({ courseId: 5 }))
    expect(res.status).toBe(200)
    expect(m.summary).not.toHaveBeenCalled()
    expect(m.sessionUpdates).toHaveLength(1)
    expect(m.sessionUpdates[0]).toMatchObject({ summary: null, topics_discussed: null })
    expect(m.sessionUpdates[0].ended_at).toBeTruthy()
  })

  it('stores the summary and passes the resolved model when a key exists', async () => {
    tables.aristotle_sessions = { session_id: 's1' }
    tables.aristotle_messages = [{ role: 'user', content: 'hello' }]
    const model = { id: 'fake' }
    m.getModelForFeature.mockResolvedValue({ model })
    m.summary.mockResolvedValue({ summary: 'sum', topics: ['a'] })
    const { POST } = await import('@/app/api/chat/aristotle/restart/route')
    await POST(req({ courseId: 5 }))
    expect(m.summary).toHaveBeenCalledWith([{ role: 'user', content: 'hello' }], model)
    expect(m.sessionUpdates[0]).toMatchObject({ summary: 'sum', topics_discussed: ['a'] })
  })
})
