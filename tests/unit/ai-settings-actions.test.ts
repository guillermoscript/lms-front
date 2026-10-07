import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const SECRET = 'sk-test-ABCDEFGHIJKLMNOPQRSTUVWX1234'

type Row = Record<string, unknown>

// --- in-memory PostgREST: eq/neq, select/insert/update/upsert/delete ------------------

const fake = vi.hoisted(() => {
  const state = { tables: {} as Record<string, Row[]> }

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
    let payload: Row = {}
    let onConflict: string[] = []
    let returning = false
    const eqs: [string, unknown][] = []
    const neqs: [string, unknown][] = []

    const rowsOf = () => (state.tables[table] ??= [])
    const matches = (r: Row) => eqs.every(([c, v]) => r[c] === v) && neqs.every(([c, v]) => r[c] !== v)

    const run = () => {
      const rows = rowsOf()
      if (op === 'insert') {
        rows.push({ ...payload })
        return { data: returning ? [{ ...payload }] : null, error: null }
      }
      if (op === 'upsert') {
        const hit = rows.find((r) => onConflict.every((c) => r[c] === payload[c]))
        if (hit) Object.assign(hit, payload)
        else rows.push({ ...payload })
        return { data: null, error: null }
      }
      const hits = rows.filter(matches)
      if (op === 'update') {
        for (const r of hits) Object.assign(r, payload)
        return { data: returning ? hits.map((r) => ({ ...r })) : null, error: null }
      }
      if (op === 'delete') {
        state.tables[table] = rows.filter((r) => !matches(r))
        return { data: returning ? hits.map((r) => ({ ...r })) : null, error: null }
      }
      return { data: hits.map((r) => ({ ...r })), error: null }
    }

    const b = {
      select() {
        if (op !== 'select') returning = true
        return b
      },
      insert(p: Row) {
        op = 'insert'
        payload = p
        return b
      },
      update(p: Row) {
        op = 'update'
        payload = p
        return b
      },
      upsert(p: Row, o?: { onConflict?: string }) {
        op = 'upsert'
        payload = p
        onConflict = (o?.onConflict ?? '').split(',')
        return b
      },
      delete() {
        op = 'delete'
        return b
      },
      eq(c: string, v: unknown) {
        eqs.push([c, v])
        return b
      },
      neq(c: string, v: unknown) {
        neqs.push([c, v])
        return b
      },
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return b
  }

  return { state, client: { from: (t: string) => builder(t) } }
})

const mocks = vi.hoisted(() => ({
  role: 'admin' as string | null,
  userId: 'u' as string | null,
  validate: vi.fn(),
  listModels: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: vi.fn() }) }))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: async () => mocks.role }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => TENANT,
  getCurrentUserId: async () => mocks.userId,
}))
vi.mock('@/lib/ai/providers', async () => {
  const ids = await import('@/lib/ai/provider-ids')
  const PROVIDERS = Object.fromEntries(
    ids.PROVIDER_IDS.map((id) => [
      id,
      { id, validate: (k: string) => mocks.validate(id, k), listModels: (k: string) => mocks.listModels(id, k), voices: id === 'openai' ? ['marin'] : undefined },
    ]),
  )
  return { PROVIDERS }
})
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: vi.fn(),
  isAiConfigured: vi.fn(async () => ({ openai: true })),
}))

import * as actions from '@/app/actions/admin/ai-settings'

const credentials = () => fake.state.tables['tenant_ai_credentials'] ?? []
const auditActions = () => (fake.state.tables['tenant_ai_audit'] ?? []).map((r) => r.action)

let actor = 0

beforeEach(() => {
  fake.state.tables = {}
  mocks.role = 'admin'
  // The limiter is module state: a fresh actor per test keeps the 5/min save cap from leaking across tests.
  mocks.userId = `${ADMIN}-${++actor}`
  mocks.validate.mockReset().mockResolvedValue({ ok: true, status: 200 })
  mocks.listModels.mockReset().mockResolvedValue([{ id: 'gpt-4o', caps: { language: true, tools: true, structured: true } }])
  process.env.AI_KEYS_ENCRYPTION_KEYS = JSON.stringify({ '1': Buffer.alloc(32, 7).toString('base64') })
  process.env.AI_KEYS_ACTIVE_VERSION = '1'
})

const seedKey = (provider = 'openai', extra: Row = {}) =>
  fake.state.tables['tenant_ai_credentials'] = [
    ...credentials(),
    { tenant_id: TENANT, provider, status: 'active', key_last4: '1234', models_cache: null, ...extra },
  ]

describe('authorization', () => {
  it.each([['student'], ['teacher'], [null]])('rejects role %s on every admin action', async (role) => {
    mocks.role = role
    const calls = [
      actions.saveAiCredential({ provider: 'openai', apiKey: SECRET }),
      actions.removeAiCredential('openai'),
      actions.testAiCredential('openai'),
      actions.refreshProviderModels('openai'),
      actions.setAiDefault({ provider: 'openai', model: 'gpt-4o' }),
      actions.setFeatureModel({ feature: 'aristotle', provider: 'openai', model: 'gpt-4o' }),
      actions.testFeature('aristotle'),
      actions.getAiSettingsDTO(),
    ]
    for (const r of await Promise.all(calls)) expect(r).toEqual({ ok: false, error: 'unauthorized' })
    expect(credentials()).toHaveLength(0)
    expect(mocks.validate).not.toHaveBeenCalled()
  })

  it('rejects an admin with no user id header', async () => {
    mocks.userId = null
    expect(await actions.getAiSettingsDTO()).toEqual({ ok: false, error: 'unauthorized' })
  })
})

describe('saveAiCredential', () => {
  it('stores ciphertext (not the key), returns last4 only, and audits', async () => {
    const res = await actions.saveAiCredential({ provider: 'openai', apiKey: `  ${SECRET}  ` })
    expect(res).toMatchObject({ ok: true, last4: SECRET.slice(-4) })
    expect(JSON.stringify(res)).not.toContain(SECRET)

    expect(credentials()).toHaveLength(1)
    const row = credentials()[0]
    expect(row).toMatchObject({ tenant_id: TENANT, provider: 'openai', status: 'active', key_version: 1, created_by: mocks.userId })
    expect(String(row.key_ciphertext)).toMatch(/^v1:/)
    expect(JSON.stringify(row)).not.toContain(SECRET)
    expect(mocks.validate).toHaveBeenCalledWith('openai', SECRET) // trimmed
    expect(auditActions()).toEqual(['set'])
  })

  it('stores nothing when the provider rejects the key', async () => {
    mocks.validate.mockResolvedValue({ ok: false, status: 401 })
    const res = await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })
    expect(res).toEqual({ ok: false, error: 'key_rejected' })
    expect(credentials()).toHaveLength(0)
    expect(auditActions()).toEqual(['validate_fail'])
  })

  it('reports an unreachable provider separately from a rejected key', async () => {
    mocks.validate.mockResolvedValue({ ok: false, reason: 'timeout' })
    expect(await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })).toEqual({
      ok: false,
      error: 'provider_unreachable',
    })
    expect(credentials()).toHaveLength(0)
  })

  it('audits a second save as rotate and keeps one row', async () => {
    await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })
    await actions.saveAiCredential({ provider: 'openai', apiKey: `${SECRET}x` })
    expect(credentials()).toHaveLength(1)
    expect(credentials()[0].key_last4).toBe('234x'.slice(-4))
    expect(auditActions()).toEqual(['set', 'rotate'])
  })

  it.each([
    [{ provider: 'nope', apiKey: SECRET }],
    [{ provider: 'openai', apiKey: 'short' }],
    [{ provider: 'openai', apiKey: `${SECRET}\nX-Evil: 1` }],
    [{ provider: 'openai', apiKey: 'a'.repeat(513) }],
  ])('refuses malformed input %#', async (input) => {
    expect(await actions.saveAiCredential(input)).toEqual({ ok: false, error: 'invalid_input' })
    expect(mocks.validate).not.toHaveBeenCalled()
  })

  it('fails closed (no write) when the master key is not configured', async () => {
    delete process.env.AI_KEYS_ENCRYPTION_KEYS
    const res = await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })
    expect(res).toEqual({ ok: false, error: 'server_misconfigured' })
    expect(credentials()).toHaveLength(0)
  })

  it('rate limits at 5 saves per minute', async () => {
    mocks.userId = 'rate-limit-user'
    const results = []
    for (let i = 0; i < 6; i++) results.push(await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET }))
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true)
    expect(results[5]).toEqual({ ok: false, error: 'rate_limited' })
  })
})

describe('removeAiCredential', () => {
  it('deletes the key and clears every mapping that pointed at it', async () => {
    seedKey('openai')
    seedKey('anthropic')
    fake.state.tables['tenant_ai_settings'] = [{ tenant_id: TENANT, default_provider: 'openai', default_model: 'gpt-4o', mode: 'byok' }]
    fake.state.tables['tenant_ai_feature_models'] = [
      { tenant_id: TENANT, feature: 'aristotle', provider: 'openai', model: 'gpt-4o' },
      { tenant_id: TENANT, feature: 'exam_grader', provider: 'anthropic', model: 'claude-sonnet' },
    ]
    fake.state.tables['course_ai_tutors'] = [
      { tenant_id: TENANT, course_id: 1, provider: 'openai', model: 'gpt-4o' },
      { tenant_id: OTHER_TENANT, course_id: 2, provider: 'openai', model: 'gpt-4o' },
    ]

    const res = await actions.removeAiCredential('openai')
    expect(res).toEqual({ ok: true, cleared: { default: true, features: ['aristotle'], courses: 1 } })
    expect(credentials().map((r) => r.provider)).toEqual(['anthropic'])
    expect(fake.state.tables['tenant_ai_settings'][0]).toMatchObject({ default_provider: null, default_model: null, mode: 'byok' })
    expect(fake.state.tables['tenant_ai_feature_models'].map((r) => r.feature)).toEqual(['exam_grader'])
    // another tenant's course is untouched
    expect(fake.state.tables['course_ai_tutors'][1]).toMatchObject({ provider: 'openai' })
    expect(auditActions()).toContain('delete')
  })

  it('does not touch another tenant\'s credential', async () => {
    fake.state.tables['tenant_ai_credentials'] = [{ tenant_id: OTHER_TENANT, provider: 'openai', status: 'active' }]
    expect(await actions.removeAiCredential('openai')).toEqual({ ok: false, error: 'not_found' })
    expect(credentials()).toHaveLength(1)
  })
})

describe('testAiCredential', () => {
  it('marks a rejected stored key invalid and an accepted one active', async () => {
    await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })

    mocks.validate.mockResolvedValue({ ok: false, status: 401 })
    expect(await actions.testAiCredential('openai')).toEqual({ ok: false, error: 'key_rejected' })
    expect(credentials()[0]).toMatchObject({ status: 'invalid', last_error_code: 'ai_key_invalid' })

    mocks.validate.mockResolvedValue({ ok: true, status: 200 })
    expect(await actions.testAiCredential('openai')).toEqual({ ok: true, status: 'active' })
    expect(credentials()[0]).toMatchObject({ status: 'active', last_error_code: null })
    expect(mocks.validate).toHaveBeenLastCalledWith('openai', SECRET)
  })

  it('leaves the status alone when the provider is unreachable', async () => {
    await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })
    mocks.validate.mockResolvedValue({ ok: false, reason: 'network' })
    expect(await actions.testAiCredential('openai')).toEqual({ ok: false, error: 'provider_unreachable' })
    expect(credentials()[0].status).toBe('active')
  })
})

describe('model selection', () => {
  it('setFeatureModel needs a credential for the provider', async () => {
    expect(await actions.setFeatureModel({ feature: 'aristotle', provider: 'openai', model: 'gpt-4o' })).toEqual({
      ok: false,
      error: 'no_credential',
    })
  })

  it('setFeatureModel refuses a provider the feature cannot use', async () => {
    seedKey('anthropic')
    expect(await actions.setFeatureModel({ feature: 'speech_stt', provider: 'anthropic', model: 'claude-sonnet' })).toEqual({
      ok: false,
      error: 'provider_not_allowed',
    })
  })

  it('setFeatureModel blocks a non-realtime model on a realtime feature', async () => {
    seedKey('openai')
    const res = await actions.setFeatureModel({ feature: 'voice_conversation', provider: 'openai', model: 'gpt-4o' })
    expect(res).toMatchObject({ ok: false, error: 'model_blocked', reason: 'not_a_realtime_model' })
    expect(fake.state.tables['tenant_ai_feature_models'] ?? []).toHaveLength(0)
  })

  it('setFeatureModel validates the realtime voice per provider', async () => {
    seedKey('openai')
    const bad = await actions.setFeatureModel({
      feature: 'voice_conversation', provider: 'openai', model: 'gpt-realtime', params: { voice: 'Zephyr' },
    })
    expect(bad).toEqual({ ok: false, error: 'invalid_voice' })
    const good = await actions.setFeatureModel({
      feature: 'voice_conversation', provider: 'openai', model: 'gpt-realtime', params: { voice: 'marin' },
    })
    expect(good).toMatchObject({ ok: true })
    expect(fake.state.tables['tenant_ai_feature_models'][0]).toMatchObject({
      tenant_id: TENANT, feature: 'voice_conversation', params: { voice: 'marin' }, updated_by: mocks.userId,
    })
  })

  it('setFeatureModel saves with a soft warning and upserts per feature', async () => {
    seedKey('openai', { models_cache: [{ id: 'gpt-4o' }] })
    const first = await actions.setFeatureModel({ feature: 'exercise_grader', provider: 'openai', model: 'gpt-4o-mini' })
    expect(first).toMatchObject({ ok: true })
    expect((first as { warnings: string[] }).warnings).toContain('model_not_in_list')
    await actions.setFeatureModel({ feature: 'exercise_grader', provider: 'openai', model: 'gpt-4o' })
    expect(fake.state.tables['tenant_ai_feature_models']).toHaveLength(1)
    expect(fake.state.tables['tenant_ai_feature_models'][0].model).toBe('gpt-4o')
  })

  it('setFeatureModel rejects unknown features and params', async () => {
    seedKey('openai')
    expect(await actions.setFeatureModel({ feature: 'bogus', provider: 'openai', model: 'gpt-4o' })).toEqual({ ok: false, error: 'invalid_input' })
    expect(
      await actions.setFeatureModel({ feature: 'aristotle', provider: 'openai', model: 'gpt-4o', params: { baseURL: 'http://evil' } }),
    ).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('null provider and model removes the override', async () => {
    seedKey('openai')
    await actions.setFeatureModel({ feature: 'aristotle', provider: 'openai', model: 'gpt-4o' })
    expect(await actions.setFeatureModel({ feature: 'aristotle', provider: null, model: null })).toMatchObject({ ok: true })
    expect(fake.state.tables['tenant_ai_feature_models']).toHaveLength(0)
  })

  it('setAiDefault upserts without clobbering mode, and refuses a speech-only provider', async () => {
    seedKey('openai')
    seedKey('assemblyai')
    fake.state.tables['tenant_ai_settings'] = [{ tenant_id: TENANT, mode: 'managed', default_provider: null, default_model: null }]
    expect(await actions.setAiDefault({ provider: 'openai', model: 'gpt-4o' })).toMatchObject({ ok: true })
    expect(fake.state.tables['tenant_ai_settings'][0]).toMatchObject({ mode: 'managed', default_provider: 'openai', default_model: 'gpt-4o' })
    expect(await actions.setAiDefault({ provider: 'assemblyai', model: 'universal-2' })).toEqual({ ok: false, error: 'provider_not_allowed' })
  })
})

describe('setCourseTutorModel', () => {
  beforeEach(() => {
    seedKey('openai')
    fake.state.tables['courses'] = [
      { course_id: 5, tenant_id: TENANT, author_id: 'teacher-1' },
      { course_id: 6, tenant_id: OTHER_TENANT, author_id: 'teacher-1' },
    ]
  })

  it('lets the course author set it and creates a disabled tutor row', async () => {
    mocks.role = 'teacher'
    mocks.userId = 'teacher-1'
    const res = await actions.setCourseTutorModel({ courseId: '5', provider: 'openai', model: 'gpt-4o' })
    expect(res).toMatchObject({ ok: true })
    expect(fake.state.tables['course_ai_tutors'][0]).toMatchObject({
      tenant_id: TENANT, course_id: 5, provider: 'openai', model: 'gpt-4o', enabled: false,
    })
  })

  it('refuses a teacher who does not own the course', async () => {
    mocks.role = 'teacher'
    mocks.userId = 'teacher-2'
    expect(await actions.setCourseTutorModel({ courseId: 5, provider: 'openai', model: 'gpt-4o' })).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('lets an admin set any course in the tenant but not another tenant\'s', async () => {
    expect(await actions.setCourseTutorModel({ courseId: 5, provider: 'openai', model: 'gpt-4o' })).toMatchObject({ ok: true })
    expect(await actions.setCourseTutorModel({ courseId: 6, provider: 'openai', model: 'gpt-4o' })).toEqual({ ok: false, error: 'not_found' })
  })

  it('refuses students and clears with null', async () => {
    mocks.role = 'student'
    expect(await actions.setCourseTutorModel({ courseId: 5, provider: 'openai', model: 'gpt-4o' })).toEqual({ ok: false, error: 'unauthorized' })
    mocks.role = 'admin'
    await actions.setCourseTutorModel({ courseId: 5, provider: 'openai', model: 'gpt-4o' })
    await actions.setCourseTutorModel({ courseId: 5, provider: null, model: null })
    expect(fake.state.tables['course_ai_tutors'][0]).toMatchObject({ provider: null, model: null })
  })
})

describe('getAiSettingsDTO', () => {
  it('returns masked provider rows for every provider and never ciphertext', async () => {
    await actions.saveAiCredential({ provider: 'openai', apiKey: SECRET })
    fake.state.tables['tenant_ai_credentials'].push({
      tenant_id: OTHER_TENANT, provider: 'anthropic', status: 'active', key_last4: 'ZZZZ', key_ciphertext: 'v1:leak',
    })
    fake.state.tables['tenant_ai_audit'].push({ tenant_id: OTHER_TENANT, actor: 'x', action: 'set', provider: 'anthropic', feature: null, at: 'now' })

    const res = await actions.getAiSettingsDTO()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { settings } = res
    expect(settings.providers).toHaveLength(9)
    expect(settings.providers.find((p) => p.provider === 'openai')).toMatchObject({ connected: true, status: 'active', last4: SECRET.slice(-4) })
    expect(settings.providers.find((p) => p.provider === 'anthropic')).toMatchObject({ connected: false, last4: null })
    expect(settings.configured).toBe(true)
    expect(settings.recentAudit.every((a) => a.provider !== 'anthropic')).toBe(true)

    const json = JSON.stringify(res)
    expect(json).not.toContain(SECRET)
    expect(json).not.toContain('ciphertext')
    expect(json).not.toContain('v1:')
  })
})
