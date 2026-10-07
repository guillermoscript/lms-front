import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `server-only` is a Next-bundler shim (no installed package); stub it for vitest.
vi.mock('server-only', () => ({}))

// --- fake admin client: an in-memory Postgres that honors .eq() like PostgREST ---------

type Row = Record<string, unknown>

const db = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    /** Simulates a buggy query that lost its filters, to prove the explicit tenant re-check holds. */
    ignoreFilters: false,
    log: [] as { table: string; op: 'select' | 'update' | 'insert'; filters: [string, unknown][]; patch?: Row }[],
  }

  function builder(table: string) {
    let op: 'select' | 'update' = 'select'
    let patch: Row | undefined
    let returning = false
    const filters: [string, unknown][] = []

    const matched = () =>
      (state.tables[table] ?? []).filter((r) => state.ignoreFilters || filters.every(([c, v]) => r[c] === v))

    const run = () => {
      const rows = matched()
      state.log.push({ table, op, filters: [...filters], patch })
      if (op === 'update') {
        for (const r of rows) Object.assign(r, patch)
        return { data: returning ? rows.map((r) => ({ ...r })) : null, error: null }
      }
      return { data: rows.map((r) => ({ ...r })), error: null }
    }

    const b = {
      select() {
        if (op === 'update') returning = true
        return b
      },
      update(p: Row) {
        op = 'update'
        patch = p
        return b
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return b
      },
      limit() {
        return b
      },
      maybeSingle() {
        const res = run()
        const rows = (res.data ?? []) as Row[]
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject)
      },
    }
    return b
  }

  const client = {
    from: (table: string) => ({
      ...builder(table),
      insert(row: Row) {
        state.log.push({ table, op: 'insert', filters: [], patch: row })
        ;(state.tables[table] ??= []).push(row)
        return Promise.resolve({ error: null })
      },
    }),
  }
  return { state, client }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

// --- provider factory: records which key built which instance, no network --------------

const factory = vi.hoisted(() => ({
  created: [] as { providerId: string; apiKey: string }[],
  realtimeGetToken: vi.fn(),
  hasRealtime: true,
}))
vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers')>()
  return {
    ...actual,
    createProviderInstance: (providerId: string, apiKey: string) => {
      factory.created.push({ providerId, apiKey })
      return {
        id: providerId,
        languageModel: (modelId: string) => ({ kind: 'language', providerId, modelId, apiKey }),
        transcriptionModel: (modelId: string) => ({ kind: 'stt', providerId, modelId }),
        imageModel: (modelId: string) => ({ kind: 'image', providerId, modelId }),
        ...(factory.hasRealtime ? { realtime: { getToken: factory.realtimeGetToken } } : {}),
      }
    },
  }
})

const transcribeMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/transcription', () => ({ transcribeWithProvider: transcribeMock }))

import { encryptKey } from '@/lib/ai/byok/crypto'
import {
  AiKeyInvalidError,
  AiModelUnsupportedError,
  AiNotConfiguredError,
  AiPlatformManagedUnavailableError,
  AiProviderQuotaError,
} from '@/lib/ai/errors'
import type { AiFeature } from '@/lib/ai/features'
import type { ProviderId } from '@/lib/ai/provider-ids'
import { createTenantAi, getModelForFeature, isAiConfigured, LAST_USED_THROTTLE_MS } from '@/lib/ai/tenant-ai'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'

const K1 = Buffer.alloc(32, 1).toString('base64')
const K2 = Buffer.alloc(32, 2).toString('base64')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const KEY_A = 'sk-tenant-A-0123456789abcdefghijklmnop'
const KEY_B = 'sk-tenant-B-0123456789abcdefghijklmnop'

const saved: Record<string, string | undefined> = {}
function setEnv(keys: Record<string, string>, active: string) {
  process.env.AI_KEYS_ENCRYPTION_KEYS = JSON.stringify(keys)
  process.env.AI_KEYS_ACTIVE_VERSION = active
}

function credential(
  tenantId: string,
  provider: ProviderId,
  plain: string,
  extra: Row = {},
  encryptFor: { tenantId: string; provider: ProviderId } = { tenantId, provider },
): Row {
  const envelope = encryptKey(plain, encryptFor)
  return {
    tenant_id: tenantId,
    provider,
    key_ciphertext: envelope,
    key_version: Number(envelope.split(':')[0].slice(1)),
    status: 'active',
    last_used_at: new Date().toISOString(), // recent: no throttle write unless a test wants one
    models_cache: null,
    ...extra,
  }
}

function seed(parts: {
  credentials?: Row[]
  settings?: Row[]
  features?: Row[]
  tutors?: Row[]
}) {
  db.state.tables = {
    tenant_ai_credentials: parts.credentials ?? [],
    tenant_ai_settings: parts.settings ?? [],
    tenant_ai_feature_models: parts.features ?? [],
    course_ai_tutors: parts.tutors ?? [],
    tenant_ai_audit: [],
  }
}

const settings = (tenantId: string, extra: Row = {}): Row => ({
  tenant_id: tenantId,
  mode: 'byok',
  default_provider: 'openai',
  default_model: 'gpt-4o',
  ...extra,
})
const mapping = (tenantId: string, feature: AiFeature, provider: string, model: string, params: Row = {}): Row => ({
  tenant_id: tenantId,
  feature,
  provider,
  model,
  params,
})

async function resolve(feature: AiFeature, courseId?: string | number, tenantId = A) {
  return createTenantAi(tenantId).getModelForFeature(feature, { courseId })
}

async function thrown(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  for (const k of ['AI_KEYS_ENCRYPTION_KEYS', 'AI_KEYS_ACTIVE_VERSION']) saved[k] = process.env[k]
  setEnv({ '1': K1 }, '1')
  db.state.ignoreFilters = false
  db.state.log = []
  factory.created = []
  factory.hasRealtime = true
  factory.realtimeGetToken.mockReset()
  transcribeMock.mockReset()
  seed({})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

// ---------------------------------------------------------------------------------------

describe('tenant isolation', () => {
  it("tenant A never gets tenant B's key", async () => {
    seed({
      credentials: [credential(B, 'openai', KEY_B)],
      settings: [settings(A), settings(B)],
    })
    const err = await thrown(resolve('lesson_tutor', undefined, A))
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect((err as AiNotConfiguredError).reason).toBe('no_key')
    expect(factory.created).toHaveLength(0)
    // every query was scoped to tenant A
    for (const q of db.state.log) expect(q.filters).toContainEqual(['tenant_id', A])
  })

  it('B resolves with B key only', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A), credential(B, 'openai', KEY_B)],
      settings: [settings(A), settings(B)],
    })
    await resolve('lesson_tutor', undefined, B)
    expect(factory.created).toEqual([{ providerId: 'openai', apiKey: KEY_B }])
  })

  it('refuses a foreign row even when the query filter is lost (explicit tenant re-check)', async () => {
    seed({
      credentials: [credential(B, 'openai', KEY_B)],
      settings: [settings(A)],
    })
    db.state.ignoreFilters = true
    const err = await thrown(resolve('lesson_tutor', undefined, A))
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect(factory.created).toHaveLength(0)
  })

  it("ignores another tenant's settings and feature rows when filters are lost", async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      settings: [settings(B, { default_model: 'b-model' })],
      features: [mapping(B, 'lesson_tutor', 'openai', 'b-feature-model')],
    })
    db.state.ignoreFilters = true
    const err = await thrown(resolve('lesson_tutor', undefined, A))
    // A has no settings/mapping of its own: not configured, never B's model
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect((err as AiNotConfiguredError).reason).toBe('no_model')
  })

  it("a ciphertext copied from tenant B into A's row fails to decrypt (AAD) and is key_invalid", async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_B, {}, { tenantId: B, provider: 'openai' })],
      settings: [settings(A)],
    })
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).toBeInstanceOf(AiKeyInvalidError)
    expect(factory.created).toHaveLength(0)
  })

  it('a ciphertext copied across providers fails the same way', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, {}, { tenantId: A, provider: 'anthropic' })],
      settings: [settings(A)],
    })
    expect(await thrown(resolve('lesson_tutor'))).toBeInstanceOf(AiKeyInvalidError)
  })

  it('rejects a missing or malformed tenant id up front', () => {
    expect(() => createTenantAi('')).toThrow()
    expect(() => createTenantAi("x' or 1=1")).toThrow()
    expect(() => createTenantAi(undefined as unknown as string)).toThrow()
  })

  it('never leaks the key through errors or logs', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A, { status: 'invalid' })], settings: [settings(A)] })
    const err = await thrown(resolve('lesson_tutor'))
    expect(JSON.stringify(err)).not.toContain(KEY_A)
    expect(String((err as Error).message)).not.toContain(KEY_A)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY_A)
  })
})

describe('resolution order', () => {
  const full = () =>
    seed({
      credentials: [credential(A, 'openai', KEY_A), credential(A, 'anthropic', 'sk-ant-A-0123456789abcdefghij')],
      settings: [settings(A, { default_provider: 'openai', default_model: 'default-model' })],
      features: [
        mapping(A, 'aristotle', 'openai', 'aristotle-feature'),
        mapping(A, 'lesson_tutor', 'openai', 'tutor-feature'),
        mapping(A, 'exercise_grader', 'anthropic', 'claude-grader'),
      ],
      tutors: [{ tenant_id: A, course_id: 7, provider: 'anthropic', model: 'claude-course' }],
    })

  it('1. the course tutor override wins for Aristotle', async () => {
    full()
    const r = await resolve('aristotle', 7)
    expect([r.providerId, r.modelId, r.selection]).toEqual(['anthropic', 'claude-course', 'course'])
    expect(r.source).toBe('tenant')
  })

  it('course override also covers the summary (inherits aristotle) but not other features', async () => {
    full()
    expect((await resolve('aristotle_summary', 7)).modelId).toBe('claude-course')
    expect((await resolve('lesson_tutor', 7)).modelId).toBe('tutor-feature')
  })

  it('course override is skipped without a courseId or for a course with no override', async () => {
    full()
    expect((await resolve('aristotle')).modelId).toBe('aristotle-feature')
    expect((await resolve('aristotle', 8)).modelId).toBe('aristotle-feature')
    expect((await resolve('aristotle', 'not-a-number')).modelId).toBe('aristotle-feature')
  })

  it('a tutor row for the same course id in another tenant is ignored', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      settings: [settings(A)],
      tutors: [{ tenant_id: B, course_id: 7, provider: 'openai', model: 'b-course-model' }],
    })
    db.state.ignoreFilters = true
    const r = await resolve('aristotle', 7)
    expect(r.modelId).toBe('gpt-4o')
    expect(r.selection).toBe('default')
  })

  it('2. the feature mapping wins over inherits and default', async () => {
    full()
    const r = await resolve('lesson_tutor')
    expect([r.providerId, r.modelId, r.selection]).toEqual(['openai', 'tutor-feature', 'feature'])
  })

  it('3. an unmapped feature inherits its parent mapping', async () => {
    full()
    const verifier = await resolve('lesson_verifier') // -> lesson_tutor
    expect([verifier.modelId, verifier.selection]).toEqual(['tutor-feature', 'inherited'])
    const summary = await resolve('aristotle_summary') // -> aristotle
    expect(summary.modelId).toBe('aristotle-feature')
    const checkpoint = await resolve('checkpoint_grader') // -> exercise_grader
    expect([checkpoint.providerId, checkpoint.modelId]).toEqual(['anthropic', 'claude-grader'])
    const speech = await resolve('speech_coach') // -> exercise_grader
    expect(speech.modelId).toBe('claude-grader')
  })

  it("the feature's own mapping beats the parent's", async () => {
    full()
    db.state.tables.tenant_ai_feature_models.push(mapping(A, 'lesson_verifier', 'openai', 'verifier-own'))
    expect((await resolve('lesson_verifier')).selection).toBe('feature')
    expect((await resolve('lesson_verifier')).modelId).toBe('verifier-own')
  })

  it('4. falls back to the tenant default', async () => {
    full()
    const r = await resolve('exam_grader')
    expect([r.providerId, r.modelId, r.selection]).toEqual(['openai', 'default-model', 'default'])
  })

  it('5. no mapping and no default is ai_not_configured (no_model)', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [] })
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect((err as AiNotConfiguredError).reason).toBe('no_model')
  })

  it('a mapped provider with no key throws no_key rather than silently using another provider', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      settings: [settings(A)],
      features: [mapping(A, 'lesson_tutor', 'anthropic', 'claude-x')],
    })
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect((err as AiNotConfiguredError).reason).toBe('no_key')
    expect(factory.created).toHaveLength(0)
  })

  it('a stored provider the feature does not allow is provider_not_allowed', async () => {
    seed({
      credentials: [credential(A, 'assemblyai', 'aai-key-0123456789')],
      settings: [settings(A)],
      features: [mapping(A, 'lesson_tutor', 'assemblyai', 'universal-2')],
    })
    const err = await thrown(resolve('lesson_tutor'))
    expect((err as AiNotConfiguredError).reason).toBe('provider_not_allowed')
  })

  it('an unknown provider id in the DB is provider_not_allowed', async () => {
    seed({ credentials: [], settings: [settings(A)], features: [mapping(A, 'lesson_tutor', 'evilcorp', 'm')] })
    expect(((await thrown(resolve('lesson_tutor'))) as AiNotConfiguredError).reason).toBe('provider_not_allowed')
  })

  it('returns the feature params of the matching mapping', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      settings: [settings(A)],
      features: [mapping(A, 'lesson_tutor', 'openai', 'gpt-4o', { temperature: 0.2 })],
    })
    expect((await resolve('lesson_tutor')).params).toEqual({ temperature: 0.2 })
  })

  it('one-shot getModelForFeature({tenantId,...}) resolves the same way', async () => {
    full()
    const r = await getModelForFeature({ tenantId: A, feature: 'aristotle', courseId: 7 })
    expect(r.modelId).toBe('claude-course')
  })

  it('refuses speech/realtime/image features on the language entry point', async () => {
    full()
    await expect(resolve('speech_stt')).rejects.toThrow(/not a language feature/)
    await expect(resolve('nonsense' as AiFeature)).rejects.toThrow(/unknown AI feature/)
  })
})

describe('credential states', () => {
  it('no credential row -> no_key', async () => {
    seed({ settings: [settings(A)] })
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).toBeInstanceOf(AiNotConfiguredError)
    expect((err as AiNotConfiguredError).reason).toBe('no_key')
  })

  it("status 'invalid' throws AiKeyInvalidError carrying provider and feature", async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A, { status: 'invalid' })], settings: [settings(A)] })
    const err = (await thrown(resolve('lesson_tutor'))) as AiKeyInvalidError
    expect(err).toBeInstanceOf(AiKeyInvalidError)
    expect(err.providerId).toBe('openai')
    expect(err.feature).toBe('lesson_tutor')
    expect(factory.created).toHaveLength(0)
  })

  it("status 'disabled' behaves as not configured", async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A, { status: 'disabled' })], settings: [settings(A)] })
    expect(await thrown(resolve('lesson_tutor'))).toBeInstanceOf(AiNotConfiguredError)
  })

  it("mode 'managed' throws AiPlatformManagedUnavailableError before touching any key", async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      settings: [settings(A, { mode: 'managed' })],
      features: [mapping(A, 'lesson_tutor', 'openai', 'gpt-4o')],
    })
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).toBeInstanceOf(AiPlatformManagedUnavailableError)
    expect(factory.created).toHaveLength(0)
    expect(db.state.log.some((q) => q.table === 'tenant_ai_credentials')).toBe(false)
    // never mistaken for a working platform fallback by the transcriber/realtime/image paths either
    await expect(createTenantAi(A).getTranscriber()).rejects.toBeInstanceOf(AiPlatformManagedUnavailableError)
    await expect(createTenantAi(A).getRealtime()).rejects.toBeInstanceOf(AiPlatformManagedUnavailableError)
    await expect(createTenantAi(A).getImageModel()).rejects.toBeInstanceOf(AiPlatformManagedUnavailableError)
  })

  it('a missing master key is a server error, not a school-facing key problem', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    delete process.env.AI_KEYS_ENCRYPTION_KEYS
    const err = await thrown(resolve('lesson_tutor'))
    expect(err).not.toBeInstanceOf(AiKeyInvalidError)
    expect((err as { code?: string }).code).toBe('config_missing')
  })

  it('an envelope with an unknown key version needs the admin to re-enter the key', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, { key_ciphertext: 'v9:AAAA:BBBB:CCCC' })],
      settings: [settings(A)],
    })
    expect(await thrown(resolve('lesson_tutor'))).toBeInstanceOf(AiKeyInvalidError)
  })

  it('decrypts the stored key and builds the provider with it', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const r = await resolve('lesson_tutor')
    expect(factory.created).toEqual([{ providerId: 'openai', apiKey: KEY_A }])
    expect(r.model).toMatchObject({ providerId: 'openai', modelId: 'gpt-4o' })
  })

  it('memoizes config and credential inside one closure (no module-level cache across closures)', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const ai = createTenantAi(A)
    await ai.getModelForFeature('lesson_tutor')
    await ai.getModelForFeature('exam_grader')
    const credReads = () => db.state.log.filter((q) => q.table === 'tenant_ai_credentials' && q.op === 'select').length
    expect(credReads()).toBe(1)
    expect(factory.created).toHaveLength(1)
    await createTenantAi(A).getModelForFeature('lesson_tutor')
    expect(credReads()).toBe(2) // a new request re-reads: revoked/rotated keys take effect immediately
  })
})

describe('last_used_at and lazy re-encrypt', () => {
  const updatesOf = (col: string) =>
    db.state.log.filter((q) => q.table === 'tenant_ai_credentials' && q.op === 'update' && q.patch && col in q.patch)

  it('touches last_used_at once when stale or never set', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, { last_used_at: null })],
      settings: [settings(A)],
    })
    const ai = createTenantAi(A)
    await ai.getModelForFeature('lesson_tutor')
    await ai.getModelForFeature('exam_grader')
    await Promise.resolve()
    expect(updatesOf('last_used_at')).toHaveLength(1)
    expect(updatesOf('last_used_at')[0].filters).toEqual(
      expect.arrayContaining([['tenant_id', A], ['provider', 'openai']]),
    )
  })

  it('skips the write while the last touch is inside the throttle window', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, { last_used_at: new Date(Date.now() - LAST_USED_THROTTLE_MS / 2).toISOString() })],
      settings: [settings(A)],
    })
    await resolve('lesson_tutor')
    expect(updatesOf('last_used_at')).toHaveLength(0)
  })

  it('writes again once the window has passed', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, { last_used_at: new Date(Date.now() - LAST_USED_THROTTLE_MS - 1000).toISOString() })],
      settings: [settings(A)],
    })
    await resolve('lesson_tutor')
    expect(updatesOf('last_used_at')).toHaveLength(1)
  })

  it('a failing last_used_at write never breaks the request', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A, { last_used_at: null })], settings: [settings(A)] })
    const realFrom = db.client.from
    db.client.from = ((table: string) => {
      const b = realFrom(table)
      return { ...b, update: () => ({ eq: () => ({ eq: () => Promise.reject(new Error('db down')) }) }) }
    }) as unknown as typeof db.client.from
    try {
      await expect(resolve('lesson_tutor')).resolves.toBeTruthy()
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      db.client.from = realFrom
    }
  })

  it('re-encrypts with the active master key when the stored version is older (compare-and-swap)', async () => {
    const cred = credential(A, 'openai', KEY_A)
    const oldEnvelope = cred.key_ciphertext as string
    seed({ credentials: [cred], settings: [settings(A)] })
    setEnv({ '1': K1, '2': K2 }, '2')

    await resolve('lesson_tutor')
    await Promise.resolve()

    const row = db.state.tables.tenant_ai_credentials[0]
    expect(row.key_version).toBe(2)
    expect((row.key_ciphertext as string).startsWith('v2:')).toBe(true)
    const write = updatesOf('key_ciphertext')[0]
    expect(write.filters).toEqual(
      expect.arrayContaining([['tenant_id', A], ['provider', 'openai'], ['key_ciphertext', oldEnvelope]]),
    )
    // and the rewritten envelope still opens for this tenant, nobody else
    setEnv({ '2': K2 }, '2')
    factory.created = []
    await resolve('lesson_tutor')
    expect(factory.created[0].apiKey).toBe(KEY_A)
  })

  it('does not rewrite an envelope that is already on the active version', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    await resolve('lesson_tutor')
    expect(updatesOf('key_ciphertext')).toHaveLength(0)
  })
})

describe('capability gating (require)', () => {
  it('passes when the model has the capability', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A, { default_model: 'gpt-4o' })] })
    const r = await createTenantAi(A).getModelForFeature('lesson_tutor', { require: ['vision', 'tools'] })
    expect(r.caps.vision).toBe(true)
  })

  it('throws ai_model_unsupported listing what is missing', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A, { default_model: 'gpt-3.5-turbo' })] })
    const err = (await thrown(createTenantAi(A).getModelForFeature('lesson_tutor', { require: ['vision'] }))) as AiModelUnsupportedError
    expect(err).toBeInstanceOf(AiModelUnsupportedError)
    expect(err.missing).toEqual(['vision'])
    expect(err.providerId).toBe('openai')
    expect(err.feature).toBe('lesson_tutor')
  })

  it('an unknown model id has no provable caps, so a required cap fails', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A, { default_model: 'brand-new-model' })] })
    await expect(
      createTenantAi(A).getModelForFeature('lesson_tutor', { require: ['vision'] }),
    ).rejects.toBeInstanceOf(AiModelUnsupportedError)
    // no require -> still usable
    await expect(resolve('lesson_tutor')).resolves.toBeTruthy()
  })

  it('provider-reported caps from models_cache override the id guess', async () => {
    seed({
      credentials: [
        credential(A, 'openai', KEY_A, { models_cache: [{ id: 'brand-new-model', label: 'x', caps: { vision: true } }] }),
      ],
      settings: [settings(A, { default_model: 'brand-new-model' })],
    })
    const r = await createTenantAi(A).getModelForFeature('lesson_tutor', { require: ['vision'] })
    expect(r.caps.vision).toBe(true)
  })

  it('no require = no gating', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A, { default_model: 'gpt-3.5-turbo' })] })
    await expect(resolve('exercise_grader')).resolves.toBeTruthy()
  })
})

describe('transcriber', () => {
  it('maps speech_stt to the configured provider and passes the tenant key to the transcription', async () => {
    seed({
      credentials: [credential(A, 'groq', 'gsk_tenantA0123456789')],
      features: [mapping(A, 'speech_stt', 'groq', 'whisper-large-v3-turbo')],
    })
    transcribeMock.mockResolvedValue({ text: 'hi', words: [{ word: 'hi', start_ms: 0, end_ms: 400, confidence: 1 }], durationSeconds: 0.4 })
    const t = await createTenantAi(A).getTranscriber()
    expect([t.providerId, t.modelId]).toEqual(['groq', 'whisper-large-v3-turbo'])
    const out = await t.transcribe(Buffer.from('audio'), { language: 'en' })
    expect(out.words).toHaveLength(1)
    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'groq', modelId: 'whisper-large-v3-turbo', apiKey: 'gsk_tenantA0123456789', options: { language: 'en' } }),
    )
  })

  it('with no mapping, uses a built-in model of an allowed provider the school has a key for', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const t = await createTenantAi(A).getTranscriber()
    expect([t.providerId, t.modelId]).toEqual(['openai', 'whisper-1'])
  })

  it('prefers assemblyai when both are available and nothing is mapped (word timings guaranteed)', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A), credential(A, 'assemblyai', 'aai-0123456789abcdef')],
      settings: [settings(A, { default_provider: null, default_model: null })],
    })
    const t = await createTenantAi(A).getTranscriber()
    expect(t.providerId).toBe('assemblyai')
  })

  it('a rejected key on one candidate does not shadow a good key on another', async () => {
    seed({
      credentials: [credential(A, 'assemblyai', 'aai-0123456789abcdef', { status: 'invalid' }), credential(A, 'groq', 'gsk_tenantA0123456789')],
      settings: [settings(A, { default_provider: null, default_model: null })],
    })
    const t = await createTenantAi(A).getTranscriber()
    expect(t.providerId).toBe('groq')
  })

  it('only rejected keys on offer: reports the rejected key, not "no key"', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A, { status: 'invalid' })],
      settings: [settings(A, { default_provider: null, default_model: null })],
    })
    const err = await thrown(createTenantAi(A).getTranscriber())
    expect(err).toBeInstanceOf(AiKeyInvalidError)
  })

  it('anthropic-only school: stt is not configured', async () => {
    seed({
      credentials: [credential(A, 'anthropic', 'sk-ant-0123456789abcdefghij')],
      settings: [settings(A, { default_provider: 'anthropic', default_model: 'claude-sonnet-4-5' })],
    })
    const err = await thrown(createTenantAi(A).getTranscriber())
    expect(err).toBeInstanceOf(AiNotConfiguredError)
  })

  it("tenant A cannot transcribe with tenant B's key", async () => {
    seed({ credentials: [credential(B, 'openai', KEY_B)], settings: [settings(A)] })
    await expect(createTenantAi(A).getTranscriber()).rejects.toBeInstanceOf(AiNotConfiguredError)
    expect(factory.created).toHaveLength(0)
  })

  it('a key rejected at transcription time is auto-invalidated, with an audit row, and rethrown typed', async () => {
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      features: [mapping(A, 'speech_stt', 'openai', 'whisper-1')],
    })
    transcribeMock.mockRejectedValue(Object.assign(new Error('Incorrect API key provided: sk-xxx'), { statusCode: 401 }))
    const t = await createTenantAi(A, { actorId: 'user-1' }).getTranscriber()
    const err = await thrown(t.transcribe(Buffer.from('x')))
    expect(err).toBeInstanceOf(AiKeyInvalidError)
    expect(db.state.tables.tenant_ai_credentials[0].status).toBe('invalid')
    expect(db.state.tables.tenant_ai_audit).toEqual([
      expect.objectContaining({ tenant_id: A, actor: 'user-1', action: 'auto_invalidated', provider: 'openai', feature: 'speech_stt' }),
    ])
  })

  it('a quota error is typed but does not invalidate the key', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], features: [mapping(A, 'speech_stt', 'openai', 'whisper-1')] })
    transcribeMock.mockRejectedValue(Object.assign(new Error('You exceeded your current quota'), { statusCode: 429 }))
    const t = await createTenantAi(A).getTranscriber()
    expect(await thrown(t.transcribe(Buffer.from('x')))).toBeInstanceOf(AiProviderQuotaError)
    expect(db.state.tables.tenant_ai_credentials[0].status).toBe('active')
  })
})

describe('realtime', () => {
  const realtimeSeed = (params: Row = {}) =>
    seed({
      credentials: [credential(A, 'openai', KEY_A)],
      features: [mapping(A, 'voice_conversation', 'openai', 'gpt-realtime', params)],
    })

  it('mints a token with the tenant key and returns the descriptor the client needs', async () => {
    realtimeSeed({ voice: 'marin' })
    factory.realtimeGetToken.mockResolvedValue({ token: 'ek_ephemeral', url: 'wss://example/realtime', expiresAt: 123 })
    const rt = await createTenantAi(A).getRealtime('voice_conversation')
    expect([rt.providerId, rt.modelId, rt.voice]).toEqual(['openai', 'gpt-realtime', 'marin'])

    const session = await rt.getToken({ instructions: 'be nice' }, { expiresAfterSeconds: 60 })
    expect(session).toMatchObject({ token: 'ek_ephemeral', url: 'wss://example/realtime', model: 'gpt-realtime', provider: 'openai', voice: 'marin' })
    expect(factory.realtimeGetToken).toHaveBeenCalledWith({
      model: 'gpt-realtime',
      expiresAfterSeconds: 60,
      sessionConfig: { instructions: 'be nice', voice: 'marin' },
    })
    expect(factory.created).toEqual([{ providerId: 'openai', apiKey: KEY_A }])
    expect(JSON.stringify(session)).not.toContain(KEY_A)
  })

  it('a caller-supplied voice wins, an unsupported configured voice is dropped', async () => {
    realtimeSeed({ voice: 'not-a-voice' })
    factory.realtimeGetToken.mockResolvedValue({ token: 't', url: 'u' })
    const rt = await createTenantAi(A).getRealtime()
    expect(rt.voice).toBeUndefined()
    await rt.getToken({ voice: 'cedar' })
    expect(factory.realtimeGetToken.mock.calls[0][0].sessionConfig.voice).toBe('cedar')
  })

  it('defaults to openai gpt-realtime when only an OpenAI key exists', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const rt = await createTenantAi(A).getRealtime()
    expect([rt.providerId, rt.modelId]).toEqual(['openai', 'gpt-realtime'])
  })

  it('a provider that cannot do realtime is rejected at the feature level', async () => {
    seed({
      credentials: [credential(A, 'anthropic', 'sk-ant-0123456789abcdefghij')],
      features: [mapping(A, 'voice_conversation', 'anthropic', 'claude-x')],
    })
    const err = await thrown(createTenantAi(A).getRealtime())
    expect((err as AiNotConfiguredError).reason).toBe('provider_not_allowed')
  })

  it('an SDK provider without a realtime factory is ai_model_unsupported', async () => {
    realtimeSeed()
    factory.hasRealtime = false
    const err = await thrown(createTenantAi(A).getRealtime())
    expect(err).toBeInstanceOf(AiModelUnsupportedError)
    expect((err as AiModelUnsupportedError).missing).toEqual(['realtime'])
  })

  it('a mint rejected for a bad key invalidates the credential', async () => {
    realtimeSeed()
    factory.realtimeGetToken.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 401 }))
    const rt = await createTenantAi(A).getRealtime()
    expect(await thrown(rt.getToken())).toBeInstanceOf(AiKeyInvalidError)
    expect(db.state.tables.tenant_ai_credentials[0].status).toBe('invalid')
  })

  it("tenant A gets no realtime from tenant B's key", async () => {
    seed({ credentials: [credential(B, 'openai', KEY_B)], features: [mapping(B, 'voice_conversation', 'openai', 'gpt-realtime')] })
    await expect(createTenantAi(A).getRealtime()).rejects.toBeInstanceOf(AiNotConfiguredError)
  })
})

describe('image model', () => {
  it('resolves the mapped image model with the tenant key', async () => {
    seed({
      credentials: [credential(A, 'google', 'AIzaTenantA0123456789')],
      features: [mapping(A, 'image_generation', 'google', 'imagen-4.0-generate-001')],
    })
    const r = await createTenantAi(A).getImageModel()
    expect([r.providerId, r.modelId]).toEqual(['google', 'imagen-4.0-generate-001'])
    expect(factory.created).toEqual([{ providerId: 'google', apiKey: 'AIzaTenantA0123456789' }])
  })

  it('defaults to openai gpt-image-1', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    expect((await createTenantAi(A).getImageModel()).modelId).toBe('gpt-image-1')
  })

  it('groq cannot serve images even if mapped', async () => {
    seed({ credentials: [credential(A, 'groq', 'gsk_x0123456789')], features: [mapping(A, 'image_generation', 'groq', 'm')] })
    expect(((await thrown(createTenantAi(A).getImageModel())) as AiNotConfiguredError).reason).toBe('provider_not_allowed')
  })
})

describe('isAiConfigured', () => {
  const client = (result: { data: unknown; error: unknown }) => ({ rpc: vi.fn().mockResolvedValue(result) })

  it('returns the provider flags from the RPC', async () => {
    const c = client({ data: { openai: true, anthropic: true, groq: false }, error: null })
    expect(await isAiConfigured(c as never, A)).toEqual({ openai: true, anthropic: true })
    expect(c.rpc).toHaveBeenCalledWith('tenant_ai_configured', { _tenant_id: A })
  })

  it('fails closed on RPC errors and odd shapes', async () => {
    expect(await isAiConfigured(client({ data: null, error: { message: 'boom' } }) as never, A)).toEqual({})
    expect(await isAiConfigured(client({ data: [true], error: null }) as never, A)).toEqual({})
    expect(await isAiConfigured(client({ data: null, error: null }) as never, A)).toEqual({})
  })
})

describe('withTenantAi (route wrapper)', () => {
  const opts = { tenantId: A, feature: 'lesson_tutor' as AiFeature, canConfigure: true }

  it('turns a missing key into the typed 402 response', async () => {
    seed({ settings: [settings(A)] })
    const res = await withTenantAi(opts, async (ai) => {
      await ai.getModelForFeature('lesson_tutor')
      return Response.json({ ok: true })
    })
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({
      error: { code: 'ai_not_configured', feature: 'lesson_tutor', canConfigure: true, settingsUrl: '/dashboard/admin/settings/ai' },
    })
  })

  it('hides the settings link from non-admins', async () => {
    seed({ settings: [settings(A)] })
    const res = await withTenantAi({ ...opts, canConfigure: false }, async (ai) => {
      await ai.getModelForFeature('lesson_tutor')
      return Response.json({ ok: true })
    })
    expect((await res.json()).error).toMatchObject({ canConfigure: false, settingsUrl: null })
  })

  it('an invalid stored key is 424', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A, { status: 'invalid' })], settings: [settings(A)] })
    const res = await withTenantAi(opts, async (ai) => {
      await ai.getModelForFeature('lesson_tutor')
      return Response.json({})
    })
    expect(res.status).toBe(424)
  })

  it('a provider 401 mid-request invalidates the key it used (lastProviderId) and returns 424', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const res = await withTenantAi({ ...opts, actorId: 'u1' }, async (ai) => {
      await ai.getModelForFeature('lesson_tutor')
      throw Object.assign(new Error('Incorrect API key provided'), { statusCode: 401 })
    })
    expect(res.status).toBe(424)
    expect(db.state.tables.tenant_ai_credentials[0].status).toBe('invalid')
    expect(db.state.tables.tenant_ai_audit[0]).toMatchObject({ action: 'auto_invalidated', provider: 'openai', actor: 'u1' })
  })

  it('passes the success response through and rethrows non-AI bugs', async () => {
    seed({ credentials: [credential(A, 'openai', KEY_A)], settings: [settings(A)] })
    const ok = await withTenantAi(opts, async (ai) => {
      const m = await ai.getModelForFeature('lesson_tutor')
      return Response.json({ model: m.modelId })
    })
    expect(await ok.json()).toEqual({ model: 'gpt-4o' })

    await expect(
      withTenantAi(opts, async () => {
        throw new TypeError('bug in our code')
      }),
    ).rejects.toThrow('bug in our code')
  })
})
