import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `server-only` is a Next-bundler shim (no installed package); stub it for vitest.
vi.mock('server-only', () => ({}))

const adminMock = vi.hoisted(() => {
  const state = {
    updateResult: { data: [{ id: 'cred-1' }] as { id: string }[] | null, error: null as unknown },
    updates: [] as unknown[],
    filters: [] as [string, unknown][],
    audits: [] as unknown[],
  }
  const updateChain = {
    eq(col: string, val: unknown) {
      state.filters.push([col, val])
      return updateChain
    },
    select: () => Promise.resolve(state.updateResult),
  }
  const client = {
    from: (table: string) => ({
      update: (patch: unknown) => {
        state.updates.push({ table, patch })
        return updateChain
      },
      insert: (row: unknown) => {
        state.audits.push({ table, row })
        return Promise.resolve({ error: null })
      },
    }),
  }
  return { state, client }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMock.client }))

import {
  AI_ERROR_HTTP_STATUS,
  AiKeyInvalidError,
  AiModelUnsupportedError,
  AiNotConfiguredError,
  AiPlatformManagedUnavailableError,
  AiProviderError,
  AiProviderQuotaError,
  aiErrorResponse,
  classifyProviderError,
  handleAiError,
  isTransientAiError,
} from '@/lib/ai/errors'

/** Shaped like the AI SDK's APICallError. */
function apiCallError(statusCode: number, responseBody = '', data?: unknown) {
  const e = new Error(`upstream said ${statusCode}`) as Error & Record<string, unknown>
  e.name = 'AI_APICallError'
  e.statusCode = statusCode
  e.responseBody = responseBody
  if (data) e.data = data
  return e
}

describe('classifyProviderError', () => {
  it.each([
    [401, AiKeyInvalidError],
    [403, AiKeyInvalidError],
    [404, AiModelUnsupportedError],
    [429, AiProviderQuotaError],
    [500, AiProviderError],
    [503, AiProviderError],
  ])('HTTP %i maps to %o', (status, Klass) => {
    expect(classifyProviderError(apiCallError(status))).toBeInstanceOf(Klass)
  })

  it('insufficient_quota is a quota error whatever the status', () => {
    const body = '{"error":{"code":"insufficient_quota"}}'
    expect(classifyProviderError(apiCallError(429, body))).toBeInstanceOf(AiProviderQuotaError)
    expect(classifyProviderError(apiCallError(402, body))).toBeInstanceOf(AiProviderQuotaError)
    expect(classifyProviderError(apiCallError(400, 'Your credit balance is too low to access the API'))).toBeInstanceOf(
      AiProviderQuotaError,
    )
  })

  it('Google / xAI style 400 "bad key" is a key error, not a generic failure', () => {
    expect(classifyProviderError(apiCallError(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}'))).toBeInstanceOf(
      AiKeyInvalidError,
    )
    expect(classifyProviderError(apiCallError(400, 'Incorrect API key provided'))).toBeInstanceOf(AiKeyInvalidError)
  })

  it('403 about model access is a model problem, not a key problem', () => {
    const err = classifyProviderError(apiCallError(403, 'Project does not have access to model gpt-9'))
    expect(err).toBeInstanceOf(AiModelUnsupportedError)
  })

  it('400 "model does not exist" is a model error', () => {
    expect(classifyProviderError(apiCallError(400, 'The model `foo` does not exist'))).toBeInstanceOf(AiModelUnsupportedError)
  })

  it('unwraps RetryError.lastError and Error.cause', () => {
    const retry = Object.assign(new Error('Failed after 3 attempts'), {
      name: 'AI_RetryError',
      lastError: apiCallError(401),
      errors: [apiCallError(500), apiCallError(401)],
    })
    expect(classifyProviderError(retry)).toBeInstanceOf(AiKeyInvalidError)

    const wrapped = new Error('boom', { cause: apiCallError(429) })
    expect(classifyProviderError(wrapped)).toBeInstanceOf(AiProviderQuotaError)
  })

  it('a missing-key SDK error is "not configured"', () => {
    const e = Object.assign(new Error('OpenAI API key is missing'), { name: 'AI_LoadAPIKeyError' })
    expect(classifyProviderError(e)).toBeInstanceOf(AiNotConfiguredError)
  })

  it('unknown shapes (strings, null, plain errors) become a provider error', () => {
    for (const e of ['x', null, undefined, new Error('weird'), { foo: 1 }]) {
      expect(classifyProviderError(e)).toBeInstanceOf(AiProviderError)
    }
  })

  it('passes typed AI errors through unchanged and attaches the upstream status', () => {
    const own = new AiNotConfiguredError('no_model')
    expect(classifyProviderError(own)).toBe(own)
    expect(classifyProviderError(apiCallError(401)).upstreamStatus).toBe(401)
  })

  it('carries provider and feature context, but never provider text', () => {
    const err = classifyProviderError(apiCallError(401, 'sk-live-supersecretvalue1234'), {
      providerId: 'openai',
      feature: 'lesson_tutor',
    })
    expect(err.providerId).toBe('openai')
    expect(err.feature).toBe('lesson_tutor')
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain('supersecret')
    expect(err.cause).toBeUndefined()
  })

  it('transient = timeout / network / 5xx / 408 only', () => {
    expect(isTransientAiError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientAiError(apiCallError(503))).toBe(true)
    expect(isTransientAiError(apiCallError(408))).toBe(true)
    expect(isTransientAiError(apiCallError(401))).toBe(false)
    expect(isTransientAiError(apiCallError(429))).toBe(false)
    expect(isTransientAiError(new AiNotConfiguredError())).toBe(false)
    expect(isTransientAiError(Object.assign(new Error('t'), { name: 'TimeoutError' }))).toBe(true)
  })

  it('status-less non-network failures are NOT transient (fail closed)', () => {
    const noObject = Object.assign(new Error('No object generated: response did not match schema.'), {
      name: 'AI_NoObjectGeneratedError',
    })
    expect(isTransientAiError(noObject)).toBe(false)
    expect(isTransientAiError(Object.assign(new Error('x'), { name: 'AI_TypeValidationError' }))).toBe(false)
    expect(isTransientAiError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false)
    expect(isTransientAiError(new Error('boom'))).toBe(false)
  })
})

describe('typed errors', () => {
  it('map to the agreed HTTP codes, never 401/403', () => {
    expect(AI_ERROR_HTTP_STATUS).toEqual({
      ai_not_configured: 402,
      ai_key_invalid: 424,
      ai_model_unsupported: 422,
      ai_quota: 429,
      ai_provider_error: 502,
    })
    expect(Object.values(AI_ERROR_HTTP_STATUS)).not.toContain(401)
    expect(Object.values(AI_ERROR_HTTP_STATUS)).not.toContain(403)
  })

  it('managed mode is reported as not configured', () => {
    const e = new AiPlatformManagedUnavailableError()
    expect(e.code).toBe('ai_not_configured')
    expect(e.httpStatus).toBe(402)
  })
})

describe('aiErrorResponse', () => {
  it('returns {error:{code,feature,canConfigure,settingsUrl}} with the mapped status', async () => {
    const res = aiErrorResponse(new AiKeyInvalidError(), { canConfigure: true, feature: 'exercise_coach' })
    expect(res.status).toBe(424)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      error: {
        code: 'ai_key_invalid',
        feature: 'exercise_coach',
        canConfigure: true,
        settingsUrl: '/dashboard/admin/settings/ai',
      },
    })
  })

  it('hides the settings link from people who cannot configure, and honours the locale', async () => {
    const student = await aiErrorResponse(new AiNotConfiguredError(), { canConfigure: false, feature: 'aristotle' }).json()
    expect(student.error.settingsUrl).toBeNull()
    expect(student.error.canConfigure).toBe(false)

    const admin = await aiErrorResponse(new AiNotConfiguredError(), {
      canConfigure: true,
      feature: 'aristotle',
      locale: 'es',
    }).json()
    expect(admin.error.settingsUrl).toBe('/es/dashboard/admin/settings/ai')
  })

  it('classifies raw provider errors and never echoes their body', async () => {
    const res = aiErrorResponse(apiCallError(429, 'insufficient_quota for sk-secretvalue12345678'), {
      canConfigure: false,
      feature: 'exam_grader',
    })
    expect(res.status).toBe(429)
    const text = await res.text()
    expect(text).not.toContain('secretvalue')
    expect(text).not.toContain('insufficient_quota')
  })
})

describe('handleAiError', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    adminMock.state.updateResult = { data: [{ id: 'cred-1' }], error: null }
    adminMock.state.updates.length = 0
    adminMock.state.filters.length = 0
    adminMock.state.audits.length = 0
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => logSpy.mockRestore())

  const opts = { canConfigure: true, feature: 'lesson_tutor' as const }

  it('rethrows errors that are bugs in our code instead of calling them provider failures', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')")
    await expect(handleAiError(bug, opts)).rejects.toBe(bug)
    expect(adminMock.state.updates).toHaveLength(0)
  })

  it('turns a rejected key into a 424 and flips the credential to invalid, once, with an audit row', async () => {
    const res = await handleAiError(apiCallError(401), {
      ...opts,
      tenantId: 'tenant-a',
      providerId: 'openai',
      actorId: 'user-1',
    })
    expect(res.status).toBe(424)

    expect(adminMock.state.updates).toEqual([
      { table: 'tenant_ai_credentials', patch: { status: 'invalid', last_error_code: 'ai_key_invalid' } },
    ])
    // scoped to the tenant AND the provider, and only while still active
    expect(adminMock.state.filters).toEqual([
      ['tenant_id', 'tenant-a'],
      ['provider', 'openai'],
      ['status', 'active'],
    ])
    expect(adminMock.state.audits).toEqual([
      {
        table: 'tenant_ai_audit',
        row: { tenant_id: 'tenant-a', actor: 'user-1', action: 'auto_invalidated', provider: 'openai', feature: 'lesson_tutor' },
      },
    ])
  })

  it('writes no audit row when the credential was already invalid', async () => {
    adminMock.state.updateResult = { data: [], error: null }
    await handleAiError(apiCallError(401), { ...opts, tenantId: 'tenant-a', providerId: 'openai' })
    expect(adminMock.state.audits).toHaveLength(0)
  })

  it('does not touch credentials for quota / provider / model failures, or without a tenant', async () => {
    await handleAiError(apiCallError(429), { ...opts, tenantId: 'tenant-a', providerId: 'openai' })
    await handleAiError(apiCallError(500), { ...opts, tenantId: 'tenant-a', providerId: 'openai' })
    await handleAiError(apiCallError(404), { ...opts, tenantId: 'tenant-a', providerId: 'openai' })
    await handleAiError(apiCallError(401), opts)
    expect(adminMock.state.updates).toHaveLength(0)
  })

  it('uses the provider carried by the error over the one passed in', async () => {
    await handleAiError(new AiKeyInvalidError({ providerId: 'anthropic' }), {
      ...opts,
      tenantId: 'tenant-a',
      providerId: 'openai',
    })
    expect(adminMock.state.filters).toContainEqual(['provider', 'anthropic'])
  })

  it('logs name / status / redacted message, never a key', async () => {
    const key = 'sk-abcdefghijklmnopqrstuvwx'
    const e = apiCallError(401)
    e.message = `Incorrect API key provided: ${key}`
    await handleAiError(e, opts)
    const logged = JSON.stringify(logSpy.mock.calls)
    expect(logged).toContain('ai_key_invalid')
    expect(logged).not.toContain(key)
  })

  it('still answers when the admin client fails', async () => {
    adminMock.state.updateResult = { data: null, error: { message: 'db down' } }
    const res = await handleAiError(apiCallError(401), { ...opts, tenantId: 'tenant-a', providerId: 'openai' })
    expect(res.status).toBe(424)
  })
})
