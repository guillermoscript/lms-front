import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ denied: null as number | null, plan: true, limited: false, token: vi.fn() }))
vi.mock('@/lib/exercises/preview-auth', () => ({
  authorizeExercisePreview: async () => state.denied ? new Response('', { status: state.denied }) : { tenantId: 'school', user: { id: 'teacher' } },
  checkExercisePreviewBudget: async () => state.limited ? new Response('', { status: 429 }) : null,
}))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => state.plan }))
vi.mock('@ai-sdk/openai', () => ({ openai: { experimental_realtime: { getToken: async (input: unknown) => {
  state.token(input); return { token: 'ephemeral-preview-token', url: 'wss://provider' }
} } } }))
import { POST } from '@/app/api/teacher/preview/realtime/route'
import { CONVERSATION_TOOLS } from '@/lib/speech/conversation'
const request = (sessionConfig: Record<string, unknown> = {}) => new Request('http://localhost/preview/realtime?courseId=2', {
  method: 'POST', body: JSON.stringify({ sessionConfig: {
    instructions: 'Current draft partner instructions', voice: 'marin', inputAudioTranscription: { language: 'en' }, ...sessionConfig,
  } }),
})
beforeEach(() => { state.denied = null; state.plan = true; state.limited = false; state.token.mockClear() })
describe('teacher realtime token', () => {
  it('mints a short-lived preview token with the same voice tools and current instructions', async () => {
    const response = await POST(request())
    expect(await response.json()).toMatchObject({ token: 'ephemeral-preview-token', tools: CONVERSATION_TOOLS })
    expect(state.token).toHaveBeenCalledWith(expect.objectContaining({
      expiresAfterSeconds: 60,
      sessionConfig: expect.objectContaining({ instructions: 'Current draft partner instructions', tools: CONVERSATION_TOOLS, turnDetection: { type: 'semantic-vad' } }),
    }))
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
