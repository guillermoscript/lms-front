import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  getPipeline: vi.fn(),
  run: vi.fn(),
  role: 'admin' as string | null,
  TENANT: '00000000-0000-0000-0000-000000000001',
}))

vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({ user: { id: 'u1' }, tenantId: state.TENANT }),
}))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => true }))
vi.mock('@/lib/exercises/record-completion', () => ({ recordExerciseCompletion: async () => ({}) }))
vi.mock('@/lib/ai/tenant-ai', () => ({ createTenantAi: () => ({ lastProviderId: () => 'openai' }) }))
vi.mock('@/lib/ai/byok/redact', () => ({ redact: (s: string) => s }))
vi.mock('@/lib/speech/registry', () => ({ getPipeline: state.getPipeline }))
vi.mock('@/lib/speech/pipeline', async (orig) => ({
  ...(await orig<typeof import('@/lib/speech/pipeline')>()),
  runSpeechPipeline: state.run,
}))

vi.mock('@/lib/supabase/admin', () => {
  const submission = {
    id: 5, user_id: 'u1', tenant_id: state.TENANT, status: 'pending', media_url: 'p/a.webm', media_type: 'audio', exercise_id: 9,
    exercises: { id: 9, title: 'T', instructions: 'I', course_id: 3, tenant_id: state.TENANT, exercise_config: { passing_score: 70 } },
  }
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    let op = 'select'
    let payload: Record<string, unknown> = {}
    const self = new Proxy(q, {
      get: (_t, prop: string) => {
        if (prop === 'then') return undefined
        if (prop === 'update') return (p: Record<string, unknown>) => { op = 'update'; payload = p; if (table === 'exercise_media_submissions') state.updates.push(p); return self }
        if (prop === 'insert') return () => Promise.resolve({ error: null })
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve(
            table === 'tenant_users' ? { data: state.role ? { role: state.role } : null, error: null }
              : op === 'update' ? { data: { id: 5 }, error: null }
              : { data: submission, error: null },
          )
        }
        void payload
        return () => self
      },
    })
    return self
  }
  return {
    createAdminClient: () => ({
      from: chain,
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://s/x' } }) }) },
    }),
  }
})

import { AiNotConfiguredError, AiKeyInvalidError } from '@/lib/ai/errors'
import { POST } from '@/app/api/exercises/media/analyze/route'

const req = () => new Request('http://localhost/api/exercises/media/analyze', { method: 'POST', body: JSON.stringify({ submissionId: 5 }) })

describe('POST /api/exercises/media/analyze', () => {
  beforeEach(() => {
    state.updates = []; state.role = 'admin'
    state.getPipeline.mockReset(); state.run.mockReset()
  })

  it('no key: 402 ai_not_configured, and the submission is never claimed', async () => {
    state.getPipeline.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'speech_stt' }))
    const res = await POST(req())
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ error: { code: 'ai_not_configured', feature: 'speech_stt', canConfigure: true } })
    expect(state.updates).toEqual([])
    expect(state.run).not.toHaveBeenCalled()
  })

  it('students get no settings link', async () => {
    state.role = 'student'
    state.getPipeline.mockRejectedValue(new AiNotConfiguredError('no_key'))
    const body = await (await POST(req())).json()
    expect(body.error).toMatchObject({ canConfigure: false, settingsUrl: null })
  })

  it('a key rejected mid-run is 424 with a code only, and the row goes back to pending', async () => {
    state.getPipeline.mockResolvedValue({ stt: {}, coach: {} })
    state.run.mockRejectedValue(new AiKeyInvalidError({ providerId: 'openai', feature: 'speech_stt', upstreamStatus: 401 }))
    const res = await POST(req())
    expect(res.status).toBe(424)
    expect(await res.json()).toMatchObject({ error: { code: 'ai_key_invalid' } })
    expect(state.updates).toEqual([{ status: 'processing' }, { status: 'pending' }])
  })

  it('an unexpected error never leaks its message and is terminal for the recording', async () => {
    state.getPipeline.mockResolvedValue({ stt: {}, coach: {} })
    state.run.mockRejectedValue(new Error('secret sk-live-abcdef internal detail'))
    const res = await POST(req())
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(text).not.toContain('sk-live')
    expect(JSON.parse(text)).toEqual({ error: { code: 'analysis_failed' } })
    expect(state.updates).toEqual([{ status: 'processing' }, { status: 'failed' }])
  })

  it('success scores and completes', async () => {
    state.getPipeline.mockResolvedValue({ stt: {}, coach: {} })
    state.run.mockResolvedValue({ score: 90, strengths: [], improvements: [], focus_next: '', annotated_transcript: [], metrics: { duration_seconds: 4 } })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ passed: true, passingScore: 70 })
    expect(state.updates[1]).toMatchObject({ status: 'completed', score: 90 })
  })
})
