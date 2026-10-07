import { describe, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  denied: null as number | null,
  canConfigure: false,
  limited: false,
  allowedVoice: true,
  generate: vi.fn(),
  pipeline: vi.fn(),
  budget: vi.fn(),
  fail: false,
  resolveError: null as unknown,
  resolved: [] as string[],
  models: [] as unknown[],
}))
vi.mock('@/lib/exercises/preview-auth', () => ({
  authorizeExercisePreview: async () => state.denied ? new Response('', { status: state.denied }) : { tenantId: 'school', user: { id: 'teacher' }, supabase: {}, canConfigure: state.canConfigure },
  checkExercisePreviewBudget: async () => { state.budget(); return state.limited ? new Response('', { status: 429 }) : null },
}))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => state.allowedVoice }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/ai/config', () => ({ DEFAULT_PASSING_SCORE: 70 }))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: (tenantId: string) => ({
    lastProviderId: () => 'openai',
    getModelForFeature: async (feature: string) => {
      state.resolved.push(`${tenantId}:${feature}`)
      if (state.resolveError) throw state.resolveError
      return { model: 'school-grader', providerId: 'openai', modelId: 'gpt-x' }
    },
    getTranscriber: async () => { state.resolved.push(`${tenantId}:speech_stt`); if (state.resolveError) throw state.resolveError; return {} },
  }),
}))
vi.mock('ai', () => ({
  Output: { object: (input: unknown) => input },
  generateText: async (options: { model?: unknown }) => {
    state.generate(options)
    state.models.push(options.model)
    if (state.fail) throw new Error('Provider unavailable')
    const evaluation = { score: 80, feedback: 'Well done.', strengths: ['Clear'], improvements: ['More detail'], corrections: [] }
    return { output: evaluation, text: JSON.stringify(evaluation) }
  },
}))
vi.mock('@/lib/speech/registry', () => ({ getPipeline: async (ai: { getTranscriber: () => Promise<unknown> }) => { await ai.getTranscriber(); return { stt: {}, coach: {} } } }))
vi.mock('@/lib/speech/pipeline', () => ({ runSpeechPipeline: async (...args: unknown[]) => {
  state.pipeline(...args)
  return { score: 80, strengths: ['Clear'], improvements: ['Slow down'], focus_next: 'Practise pacing', metrics: {}, annotated_transcript: [] }
} }))

import { POST } from '@/app/api/teacher/preview/exercise-run/route'
import { AiNotConfiguredError } from '@/lib/ai/errors'
const draft = (type = 'essay', exercise_config: Record<string, unknown> = {}) => ({
  courseId: 2, title: 'Unsaved title', instructions: 'Unsaved instructions', system_prompt: 'Unsaved prompt',
  exercise_type: type, exercise_config,
})
const request = (type = 'essay', input: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => new Request('http://localhost/api/teacher/preview/exercise-run', {
  method: 'POST', body: JSON.stringify({ draft: draft(type, config), content: 'Test response', ...input }),
})
beforeEach(() => {
  state.resolveError = null; state.resolved = []; state.models = []; state.canConfigure = false
  state.denied = null; state.limited = false; state.allowedVoice = true; state.fail = false
  state.generate.mockClear(); state.pipeline.mockClear(); state.budget.mockClear()
})

describe('staff exercise dry runs', () => {
  it.each(['essay', 'discussion', 'quiz', 'multiple_choice', 'true_false', 'fill_in_the_blank', 'coding_challenge', 'artifact'])('evaluates %s without requiring a saved exercise or any persistence client', async (type) => {
    const response = await POST(request(type))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ score: 80, passed: true, passingScore: 70, preview: true })
    expect(state.generate).toHaveBeenCalledOnce()
    expect(JSON.stringify(state.generate.mock.calls[0])).toContain('Unsaved instructions')
    expect(state.generate.mock.calls[0][0].system).toContain('Unsaved prompt')
  })

  it('uses configured questions and answer keys without spending AI credits', async () => {
    const response = await POST(request('quiz', { content: undefined, answers: [{ questionId: '1', value: 1 }] }, {
      passing_score: 90, questions: [{ id: '1', type: 'multiple_choice', prompt: 'Choose', options: ['A', 'B'], correctIndex: 1 }],
    }))
    expect(await response.json()).toMatchObject({ score: 100, passed: true, evaluator: 'deterministic', preview: true })
    expect(state.generate).not.toHaveBeenCalled(); expect(state.budget).not.toHaveBeenCalled()
  })

  it('uses the same conversation grader and private criteria', async () => {
    const transcript = [{ role: 'user', text: 'I would like a coffee.' }]
    const response = await POST(request('real_time_conversation', { transcript }, { evaluation_criteria: 'Confirm the order.' }))
    expect(await response.json()).toMatchObject({ score: 80, preview: true, corrections: [] })
    expect(state.generate.mock.calls[0][0].system).toContain('Confirm the order.')
    expect(JSON.parse(state.generate.mock.calls[0][0].prompt)).toEqual({ transcript })
  })

  it.each(['audio_evaluation', 'video_evaluation'])('uses the speech pipeline for %s without storing media', async (type) => {
    const form = new FormData()
    form.set('draft', JSON.stringify(draft(type)))
    form.set('media', new File(['fake test recording'], 'test.webm', { type: type === 'audio_evaluation' ? 'audio/webm' : 'video/webm' }))
    const response = await POST(new Request('http://localhost/preview', { method: 'POST', body: form }))
    expect(await response.json()).toMatchObject({ score: 80, preview: true, feedback: 'Practise pacing' })
    expect(state.pipeline).toHaveBeenCalledOnce()
    expect(state.pipeline.mock.calls[0][0]).toMatch(/^data:(audio|video)\/webm;base64,/)
    expect(state.pipeline.mock.calls[0][1]).toMatchObject({ title: 'Unsaved title', instructions: 'Unsaved instructions' })
    expect(state.pipeline.mock.calls[0][1]).not.toHaveProperty('exerciseId')
  })

  it.each([401, 403, 404])('blocks unauthorized scope %s before AI usage', async (status) => {
    state.denied = status
    expect((await POST(request())).status).toBe(status)
    expect(state.generate).not.toHaveBeenCalled(); expect(state.budget).not.toHaveBeenCalled()
  })
  it('honors AI budgets and voice plan limits', async () => {
    state.limited = true
    expect((await POST(request())).status).toBe(429)
    state.limited = false; state.allowedVoice = false
    expect((await POST(request('real_time_conversation', { transcript: [{ role: 'user', text: 'Hello' }] }))).status).toBe(403)
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('rejects empty responses and unsupported types', async () => {
    expect((await POST(request('essay', { content: '' }))).status).toBe(400)
    expect((await POST(request('unknown'))).status).toBe(400)
    expect((await POST(request('real_time_conversation', { transcript: [{ role: 'assistant', text: 'Hello' }] }))).status).toBe(400)
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('rejects whitespace-only conversation turns before spending AI credits', async () => {
    expect((await POST(request('real_time_conversation', { transcript: [{ role: 'user', text: '   ' }] }))).status).toBe(400)
    expect(state.generate).not.toHaveBeenCalled()
    expect(state.budget).not.toHaveBeenCalled()
  })

  it('reports provider failure without falling back to a fabricated score', async () => {
    state.fail = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(request())).status).toBe(502)
    vi.restoreAllMocks()
  })

  it.each(['essay', 'artifact', 'real_time_conversation'])('grades %s with the school\'s own model for the auth tenant', async (type) => {
    const response = await POST(request(type, type === 'real_time_conversation' ? { transcript: [{ role: 'user', text: 'Hello' }] } : {}))
    expect(response.status).toBe(200)
    expect(state.resolved).toEqual(['school:exercise_grader'])
    expect(state.models).toEqual(['school-grader'])
  })

  it('402s a school without a key before the budget, with the settings link for admins', async () => {
    state.resolveError = new AiNotConfiguredError('no_key')
    state.canConfigure = true
    const response = await POST(request())
    expect(response.status).toBe(402)
    expect(await response.json()).toEqual({
      error: { code: 'ai_not_configured', feature: 'exercise_grader', canConfigure: true, settingsUrl: '/dashboard/admin/settings/ai' },
    })
    expect(state.budget).not.toHaveBeenCalled(); expect(state.generate).not.toHaveBeenCalled()
  })

  it('resolves the speech pipeline for media previews before the budget', async () => {
    state.resolveError = new AiNotConfiguredError('no_key')
    const form = new FormData()
    form.set('draft', JSON.stringify(draft('audio_evaluation')))
    form.set('media', new File(['x'], 'test.webm', { type: 'audio/webm' }))
    const response = await POST(new Request('http://localhost/preview', { method: 'POST', body: form }))
    expect(response.status).toBe(402)
    expect(state.budget).not.toHaveBeenCalled(); expect(state.pipeline).not.toHaveBeenCalled()
  })
})
