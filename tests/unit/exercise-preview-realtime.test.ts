import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  denied: null as number | null, plan: true, limited: false, token: vi.fn(),
  provider: 'openai', resolveError: null as unknown, budgetChecks: 0, canConfigure: false,
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/exercises/preview-auth', () => ({
  authorizeExercisePreview: async () => state.denied
    ? new Response('', { status: state.denied })
    : { tenantId: 'school', user: { id: 'teacher' }, canConfigure: state.canConfigure },
  checkExercisePreviewBudget: async () => { state.budgetChecks++; return state.limited ? new Response('', { status: 429 }) : null },
}))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => state.plan }))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => state.provider,
    getRealtime: async () => {
      if (state.resolveError) throw state.resolveError
      return {
        providerId: state.provider,
        modelId: 'school-realtime',
        voice: 'school-voice',
        getToken: async (sessionConfig: unknown, options: unknown) => {
          state.token({ sessionConfig, ...(options as object) })
          return { token: 'ephemeral-preview-token', url: 'wss://provider', provider: state.provider, model: 'school-realtime', voice: 'school-voice' }
        },
      }
    },
  }),
}))
import { POST } from '@/app/api/teacher/preview/realtime/route'
import { CONVERSATION_TOOLS } from '@/lib/speech/conversation'
const request = (sessionConfig: Record<string, unknown> = {}) => new Request('http://localhost/preview/realtime?courseId=2', {
  method: 'POST', body: JSON.stringify({ sessionConfig: {
    instructions: 'Current draft partner instructions', voice: 'marin', inputAudioTranscription: { language: 'en' }, ...sessionConfig,
  } }),
})
beforeEach(() => {
  state.denied = null; state.plan = true; state.limited = false; state.token.mockClear()
  state.provider = 'openai'; state.resolveError = null; state.budgetChecks = 0; state.canConfigure = false
})
describe('teacher realtime token', () => {
  it('mints a short-lived preview token with the same voice tools and current instructions', async () => {
    const response = await POST(request())
    expect(await response.json()).toMatchObject({
      token: 'ephemeral-preview-token', tools: CONVERSATION_TOOLS, provider: 'openai', model: 'school-realtime',
    })
    expect(state.token).toHaveBeenCalledWith(expect.objectContaining({
      expiresAfterSeconds: 60,
      sessionConfig: expect.objectContaining({ instructions: 'Current draft partner instructions', voice: 'marin', tools: CONVERSATION_TOOLS, turnDetection: { type: 'semantic-vad' } }),
    }))
  })
  it("drops the builder's OpenAI voice when the school's provider has other voices", async () => {
    state.provider = 'xai'
    await POST(request())
    const sent = state.token.mock.calls[0][0].sessionConfig
    expect(sent.voice).toBeUndefined()
  })
  it('returns the typed 402 and spends no preview budget when the school has no key', async () => {
    const { AiNotConfiguredError } = await import('@/lib/ai/errors')
    state.resolveError = new AiNotConfiguredError('no_key', { feature: 'voice_conversation' })
    state.canConfigure = true
    const response = await POST(request())
    expect(response.status).toBe(402)
    expect((await response.json()).error).toMatchObject({ code: 'ai_not_configured', feature: 'voice_conversation', canConfigure: true })
    expect(state.budgetChecks).toBe(0)
    expect(state.token).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404])('rejects unauthorized scope %s before minting tokens', async (status) => {
    state.denied = status
    expect((await POST(request())).status).toBe(status)
    expect(state.token).not.toHaveBeenCalled()
  })
  it('enforces voice plans and AI usage limits', async () => {
    state.plan = false
    expect((await POST(request())).status).toBe(403)
    state.plan = true; state.limited = true
    expect((await POST(request())).status).toBe(429)
    expect(state.token).not.toHaveBeenCalled()
  })
  it('rejects malformed configuration and course ids', async () => {
    expect((await POST(request({ instructions: '', voice: 'unknown' }))).status).toBe(400)
    expect((await POST(new Request('http://localhost/preview?courseId=0', { method: 'POST' }))).status).toBe(400)
    expect(state.token).not.toHaveBeenCalled()
  })
})
