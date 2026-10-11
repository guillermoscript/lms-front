import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ type: 'artifact', completionError: false, evaluationError: false, resultError: false, statuses: [] as string[], track: vi.fn() }))
const evaluation = { score: 85, feedback: 'Good', strengths: [], improvements: [], corrections: [], metrics: { duration_seconds: 30 }, annotated_transcript: [] }
vi.mock('@/lib/supabase/api-auth', () => ({ getApiAuthContext: async () => ({ user: { id: 'student' }, tenantId: 'school', supabase: {} }) }))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => true }))
vi.mock('@/lib/exercises/record-completion', () => ({ recordExerciseCompletion: async () => ({ created: !state.completionError, error: state.completionError ? 'Database unavailable' : null }) }))
vi.mock('@/lib/analytics/server', () => ({ track: state.track }))
vi.mock('@/lib/ai/tenant-ai', () => ({ createTenantAi: () => ({ getModelForFeature: async () => ({ model: {} }), lastProviderId: () => null }) }))
vi.mock('@/lib/exercises/ai-failure', () => ({ canConfigureAi: async () => false, aiFailureResponse: async (_e: unknown, _o: unknown, fallback: () => Response) => fallback() }))
vi.mock('@/lib/ai/with-tenant-ai', () => ({ withTenantAi: async (_o: unknown, run: (ai: unknown) => unknown) => run({ lastProviderId: () => null }) }))
vi.mock('@/lib/speech/registry', () => ({ getPipeline: async () => ({}) }))
vi.mock('@/lib/speech/pipeline', () => ({ runSpeechPipeline: async () => evaluation, SpeechAudioError: class extends Error {} }))
vi.mock('@/lib/exercises/evaluate-artifact', () => ({ evaluateArtifactExercise: async () => evaluation }))
vi.mock('ai', () => ({ generateText: async () => ({ output: evaluation }), Output: { object: () => ({}) } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/test.webm' } }) }) },
  from: (table: string) => {
    let write = false
    let finalResult = false
    const exercise = { id: 7, tenant_id: 'school', course_id: 1, title: 'Practice', instructions: 'Practice', exercise_type: state.type, exercise_config: { passing_score: 70 }, courses: { tenant_id: 'school' } }
    const result = () => ({
      data: table === 'exercises' ? exercise : table === 'tenant_users' ? { role: 'student' } : table === 'exercise_media_submissions' ? { id: 11, user_id: 'student', tenant_id: 'school', exercise_id: 7, exercises: exercise, status: 'pending', media_url: 'test.webm', media_type: 'audio', duration_seconds: 30 } : [],
      error: write && ((table === 'exercise_evaluations' && state.evaluationError) || (table === 'exercise_media_submissions' && finalResult && state.resultError)) ? { message: 'Database unavailable' } : null,
      count: 0,
    })
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
      insert: () => { write = true; return chain },
      update: (row: { status?: string }) => { write = true; finalResult = row.status === 'completed'; if (row.status) state.statuses.push(row.status); return chain },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return chain
  },
}) }))

import { POST as artifact } from '@/app/api/exercises/artifact/evaluate/route'
import { POST as conversation } from '@/app/api/exercises/realtime/evaluate/route'
import { POST as recording } from '@/app/api/exercises/media/analyze/route'

beforeEach(() => { state.completionError = false; state.evaluationError = false; state.resultError = false; state.statuses = []; state.track.mockClear() })
const request = () => new Request('http://localhost/evaluate', { method: 'POST', body: JSON.stringify({ exerciseId: 7, content: 'My work', submissionId: 11, tab: 'test_tab_123', transcript: [{ role: 'user', text: 'Hello there.' }] }) })
describe.each([
  { name: 'artifact', type: 'artifact', run: artifact },
  { name: 'conversation', type: 'real_time_conversation', run: conversation },
  { name: 'recording', type: 'audio_evaluation', run: recording },
])('$name exercise saves', ({ name, type, run }) => {
  it('does not report passing success when completion cannot be saved', async () => {
    state.type = type; state.completionError = true
    const response = await run(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'Could not record the result' })
    expect(state.track).not.toHaveBeenCalled()
    if (name !== 'artifact') expect(state.statuses.at(-1)).toBe('pending')
  })
  it('does not report success when the evaluation cannot be saved', async () => {
    state.type = type; state.evaluationError = true
    expect((await run(request())).status).toBe(500)
    expect(state.track).not.toHaveBeenCalled()
    if (name !== 'artifact') expect(state.statuses.at(-1)).toBe('pending')
  })
  it('still returns the saved passing evaluation', async () => {
    state.type = type
    const response = await run(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ passed: true, passingScore: 70 })
  })
})

it.each([{ type: 'real_time_conversation', run: conversation }, { type: 'audio_evaluation', run: recording }])('keeps a media attempt retryable when its result update fails ($type)', async ({ type, run }) => {
  state.type = type; state.resultError = true
  expect((await run(request())).status).toBe(500)
  expect(state.statuses.at(-1)).toBe('pending')
  expect(state.track).not.toHaveBeenCalled()
})
