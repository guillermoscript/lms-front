import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const SUBMISSIONS = 'exercise_media_submissions'

const state = vi.hoisted(() => {
  const s = {
    TENANT: '00000000-0000-0000-0000-000000000001',
    getPipeline: vi.fn(),
    access: true,
    role: 'student' as string | null,
    /** What the two count queries answer: the pending/processing flood guard, then the daily cap. */
    pending: 0,
    daily: 0,
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    /** Count queries (awaited without `single()`), by table. */
    counts: [] as { table: string; guard: 'pending' | 'daily'; since?: string }[],
    signedUrls: [] as string[],
    from: (table: string) => {
      let op: 'select' | 'insert' | 'update' = 'select'
      // Only the flood guard filters by status.
      let guard: 'pending' | 'daily' = 'daily'
      let since: string | undefined
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        in: () => { guard = 'pending'; return query },
        gte: (_column: string, value: string) => { since = value; return query },
        update: () => { op = 'update'; return query },
        insert: (row: Record<string, unknown>) => { op = 'insert'; s.inserts.push({ table, row }); return query },
        single: async () => (op === 'insert'
          ? { data: { id: 77 }, error: null }
          : {
              error: null,
              data: { id: 9, exercise_type: 'audio_evaluation', course_id: 3, tenant_id: s.TENANT, exercise_config: {} },
            }),
        maybeSingle: async () => ({ data: s.role ? { role: s.role } : null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          // `markCredentialInvalid` awaits update().select(): no active row here, so no audit insert.
          if (op === 'update') return Promise.resolve({ data: [], error: null }).then(resolve)
          s.counts.push({ table, guard, since })
          return Promise.resolve({ count: s[guard], error: null }).then(resolve)
        },
      }
      return query
    },
  }
  return s
})

vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({ user: { id: 'u1' }, tenantId: state.TENANT, supabase: { from: state.from } }),
}))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => state.access }))
vi.mock('@/lib/ai/tenant-ai', () => ({ createTenantAi: () => ({ lastProviderId: () => 'openai' }) }))
vi.mock('@/lib/speech/registry', () => ({ getPipeline: state.getPipeline }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: state.from,
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          state.signedUrls.push(path)
          return { data: { signedUrl: 'https://storage/upload' }, error: null }
        },
      }),
    },
  }),
}))

import { AiKeyInvalidError, AiModelUnsupportedError, AiNotConfiguredError } from '@/lib/ai/errors'
import { POST } from '@/app/api/exercises/media/upload-url/route'

const req = (mediaType = 'audio') =>
  new Request('http://localhost/api/exercises/media/upload-url', {
    method: 'POST',
    body: JSON.stringify({ exerciseId: 9, mediaType, filename: 'recording.webm' }),
  })

const submissionInserts = () => state.inserts.filter((i) => i.table === SUBMISSIONS)
const submissionCounts = () => state.counts.filter((c) => c.table === SUBMISSIONS)

/** Nothing the student pays for: no row (= no daily attempt), no upload slot, not even a cap lookup. */
function expectNothingSpent() {
  expect(submissionInserts()).toEqual([])
  expect(state.signedUrls).toEqual([])
  expect(submissionCounts()).toEqual([])
}

describe('POST /api/exercises/media/upload-url (BYOK, #958)', () => {
  beforeEach(() => {
    state.access = true; state.role = 'student'; state.pending = 0; state.daily = 0
    state.inserts = []; state.counts = []; state.signedUrls = []
    state.getPipeline.mockReset()
    state.getPipeline.mockResolvedValue({ stt: {}, coach: {} })
  })

  it('no key: typed 402 before the caps, and the student has spent nothing', async () => {
    state.getPipeline.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'speech_stt' }))
    const res = await POST(req())
    expect(res.status).toBe(402)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      error: { code: 'ai_not_configured', feature: 'speech_stt', canConfigure: false, settingsUrl: null },
    })
    expectNothingSpent()
  })

  it('a school admin gets the settings link', async () => {
    state.role = 'admin'
    state.getPipeline.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'speech_stt' }))
    const body = await (await POST(req())).json()
    expect(body.error).toMatchObject({ canConfigure: true, settingsUrl: '/dashboard/admin/settings/ai' })
  })

  it('names whichever half of the pipeline failed (the coach model)', async () => {
    state.getPipeline.mockRejectedValue(new AiModelUnsupportedError({ feature: 'speech_coach' }))
    const res = await POST(req('video'))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'ai_model_unsupported', feature: 'speech_coach' } })
    expectNothingSpent()
  })

  it('a key already marked invalid: 424 and nothing spent', async () => {
    state.getPipeline.mockRejectedValue(new AiKeyInvalidError({ providerId: 'openai', feature: 'speech_stt' }))
    const res = await POST(req())
    expect(res.status).toBe(424)
    expect((await res.json()).error.code).toBe('ai_key_invalid')
    expectNothingSpent()
  })

  it('no key wins over the daily cap: 402, not 429', async () => {
    state.daily = 5
    state.getPipeline.mockRejectedValue(new AiNotConfiguredError('no_key', { feature: 'speech_stt' }))
    expect((await POST(req())).status).toBe(402)
  })

  it('a failure that is not an AI one stays a 500 and never echoes its message', async () => {
    state.getPipeline.mockRejectedValue(new Error('secret sk-live-abcdef internal detail'))
    const res = await POST(req())
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(text).not.toContain('sk-live')
    expectNothingSpent()
  })

  it('access is checked before the key is resolved', async () => {
    state.access = false
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(state.getPipeline).not.toHaveBeenCalled()
  })

  it('with a key, the daily cap still answers 429 and writes nothing', async () => {
    state.daily = 5
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'daily_limit_reached', limit: 5 })
    expect(submissionInserts()).toEqual([])
    expect(state.signedUrls).toEqual([])
  })

  it('the flood guard only counts submissions that can still be in flight', async () => {
    state.pending = 5
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(submissionInserts()).toEqual([])
    // Rows stranded pending/processing long ago must not lock the exercise for good.
    const guard = submissionCounts().find((c) => c.guard === 'pending')
    const ageMs = Date.now() - Date.parse(guard?.since ?? '')
    expect(ageMs).toBeGreaterThanOrEqual(15 * 60 * 1000)
    expect(ageMs).toBeLessThan(15 * 60 * 1000 + 5_000)
  })

  it('with a key, opens one pending submission and returns the upload slot', async () => {
    state.daily = 2
    const res = await POST(req('video'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      submissionId: 77,
      uploadUrl: 'https://storage/upload',
      dailyAttemptsUsed: 3,
      maxDailyAttempts: 5,
    })
    expect(body.storagePath).toBe(state.signedUrls[0])
    expect(state.getPipeline).toHaveBeenCalledTimes(1)
    expect(submissionInserts()).toHaveLength(1)
    expect(submissionInserts()[0].row).toMatchObject({
      exercise_id: 9, user_id: 'u1', tenant_id: state.TENANT, media_type: 'video', status: 'pending',
    })
  })
})
