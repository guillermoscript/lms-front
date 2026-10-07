/**
 * The exercise coach surfaces (student chat + staff preview) under BYOK: the
 * school's model is resolved after auth/access/role and BEFORE the rate limit,
 * the usage budget and any row write, so a school without a key costs nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  role: 'student' as string | null,
  exerciseFound: true,
  resolveError: null as unknown,
  resolveOptions: [] as unknown[],
  order: [] as string[],
  inserts: [] as string[],
  streamModel: null as unknown,
}))

function supabaseStub() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === 'tenant_users' && state.role ? { role: state.role } : null }),
        insert: async () => { state.inserts.push(table); return { error: null } },
      }
      return b
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({ user: { id: 'user-1' }, tenantId: 'tenant-1', supabase: supabaseStub() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabaseStub() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: async () => 'tenant-1' }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/exercises/grading-secrets', () => ({ fetchGradingSecrets: async () => null }))
vi.mock('@/lib/ai/chat-helpers', () => ({
  capChatHistory: <T,>(m: T[]) => m,
  lastUserMessageText: () => 'hi',
  fetchTenantExercise: async () => (state.exerciseFound ? { title: 't', instructions: 'i', course_id: 1, exercise_type: 'essay' } : null),
}))
vi.mock('@/lib/ai/attachments', () => ({
  persistLastUserAttachments: async () => [],
  sanitizeLastUserAttachments: <T,>(m: T) => m,
}))
vi.mock('@/lib/ai/tools', () => ({ createExerciseTools: () => ({}), createPreviewExerciseTools: () => ({}) }))
vi.mock('@/lib/ai/prompts', () => ({ PROMPTS: { exerciseCoach: () => 'system' } }))
vi.mock('@/lib/rate-limit', () => ({
  AI_CHAT_TURNS_PER_MINUTE: 10,
  aiChatLimiter: { check: async () => { state.order.push('limiter') } },
}))
vi.mock('@/lib/ai/chat-usage', () => ({
  checkAiChatUsage: async () => { state.order.push('usage'); return { allowed: true } },
  aiChatRateLimitedResponse: () => new Response('', { status: 429 }),
  aiChatUsageLimitResponse: () => new Response('', { status: 429 }),
}))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => 'openai',
    getModelForFeature: async (feature: string, options: unknown) => {
      state.order.push(`resolve:${feature}`)
      state.resolveOptions.push(options)
      if (state.resolveError) throw state.resolveError
      return { model: 'school-coach', providerId: 'openai', modelId: 'gpt-x' }
    },
  }),
}))
vi.mock('@langfuse/tracing', () => ({ propagateAttributes: (_attrs: unknown, fn: () => unknown) => fn() }))
vi.mock('ai', () => ({
  convertToModelMessages: async () => [],
  stepCountIs: () => () => false,
  streamText: (args: { model: unknown }) => {
    state.streamModel = args.model
    return { toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) }
  },
}))

import { POST as studentPOST } from '@/app/api/chat/exercises/student/route'
import { POST as previewPOST } from '@/app/api/teacher/preview/exercise/route'
import { AiNotConfiguredError, AiKeyInvalidError } from '@/lib/ai/errors'

const json = (body: unknown) => new Request('http://school.lvh.me/api', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const userMessage = (parts: unknown[] = [{ type: 'text', text: 'hi' }]) => ({ role: 'user', parts })

beforeEach(() => {
  state.role = 'student'; state.exerciseFound = true; state.resolveError = null
  state.resolveOptions = []; state.order = []; state.inserts = []; state.streamModel = null
})

describe('POST /api/chat/exercises/student', () => {
  it('streams with the school\'s model, resolved before the limiter and usage', async () => {
    const res = await studentPOST(json({ messages: [userMessage()], exerciseId: 7 }))
    expect(res.status).toBe(200)
    expect(state.streamModel).toBe('school-coach')
    expect(state.order).toEqual(['resolve:exercise_coach', 'limiter', 'usage'])
  })

  it('402s a school without a key: no limiter, usage or message rows', async () => {
    state.resolveError = new AiNotConfiguredError('no_key')
    const res = await studentPOST(json({ messages: [userMessage()], exerciseId: 7 }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toMatchObject({ code: 'ai_not_configured', feature: 'exercise_coach', canConfigure: false })
    expect(state.order).toEqual(['resolve:exercise_coach'])
    expect(state.inserts).toHaveLength(0)
  })

  it('shows an admin the settings link', async () => {
    state.role = 'admin'
    state.resolveError = new AiKeyInvalidError({ providerId: 'openai' })
    const res = await studentPOST(json({ messages: [userMessage()], exerciseId: 7 }))
    expect(res.status).toBe(424)
    expect((await res.json()).error).toMatchObject({ canConfigure: true, settingsUrl: '/dashboard/admin/settings/ai' })
  })

  it('404s a missing exercise before resolving any model', async () => {
    state.exerciseFound = false
    const res = await studentPOST(json({ messages: [userMessage()], exerciseId: 7 }))
    expect(res.status).toBe(404)
    expect(state.order).toEqual([])
  })

  it('requires vision only when the newest message carries an image', async () => {
    await studentPOST(json({ messages: [userMessage()], exerciseId: 7 }))
    await studentPOST(json({ messages: [userMessage([{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA==' }])], exerciseId: 7 }))
    expect(state.resolveOptions).toEqual([{ require: undefined }, { require: ['vision'] }])
  })
})

describe('POST /api/teacher/preview/exercise', () => {
  it('403s a student before resolving a model', async () => {
    const res = await previewPOST(json({ messages: [userMessage()] }))
    expect(res.status).toBe(403)
    expect(state.order).toEqual([])
  })

  it('streams with the school\'s model for staff, resolved before the limiter', async () => {
    state.role = 'teacher'
    const res = await previewPOST(json({ messages: [userMessage()] }))
    expect(res.status).toBe(200)
    expect(state.streamModel).toBe('school-coach')
    expect(state.order).toEqual(['resolve:exercise_coach', 'limiter', 'usage'])
  })

  it('402s a teacher without a key with no settings link and no usage', async () => {
    state.role = 'teacher'
    state.resolveError = new AiNotConfiguredError('no_key')
    const res = await previewPOST(json({ messages: [userMessage()] }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toMatchObject({ canConfigure: false, settingsUrl: null })
    expect(state.order).toEqual(['resolve:exercise_coach'])
  })
})
