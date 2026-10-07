import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { AiKeyInvalidError, AiModelUnsupportedError, AiProviderError } from '@/lib/ai/errors'
import {
  PROVIDERS,
  PROVIDER_IDS,
  createProviderInstance,
  providerBaseUrl,
  voicesFor,
  type ProviderId,
} from '@/lib/ai/providers'

const KEY = 'test-key-1234567890abcdef'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** [url, init] of the first call. */
function firstCall(): [string, RequestInit & { headers: Record<string, string> }] {
  const [url, init] = fetchMock.mock.calls[0]
  return [String(url), init]
}

describe('registry shape', () => {
  it('has exactly the allowlisted providers, each bound to a fixed host', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PROVIDER_IDS].sort())
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].host).toMatch(/^[a-z0-9.-]+\.[a-z]+$/)
      expect(providerBaseUrl(id)).toContain(PROVIDERS[id].host)
    }
  })

  it('only AssemblyAI is speech-only; realtime voices exist for exactly the realtime providers', () => {
    expect(PROVIDERS.assemblyai.kinds).toEqual(['stt'])
    for (const id of PROVIDER_IDS) {
      expect(voicesFor(id).length > 0).toBe(PROVIDERS[id].kinds.includes('realtime'))
    }
  })
})

describe('validate', () => {
  const cases: { id: ProviderId; url: string; header: [string, string] }[] = [
    { id: 'openai', url: 'https://api.openai.com/v1/models', header: ['Authorization', `Bearer ${KEY}`] },
    { id: 'anthropic', url: 'https://api.anthropic.com/v1/models?limit=1', header: ['x-api-key', KEY] },
    {
      id: 'google',
      url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      header: ['x-goog-api-key', KEY],
    },
    // /models is public on OpenRouter, so a bad key must be caught on /key
    { id: 'openrouter', url: 'https://openrouter.ai/api/v1/key', header: ['Authorization', `Bearer ${KEY}`] },
    { id: 'groq', url: 'https://api.groq.com/openai/v1/models', header: ['Authorization', `Bearer ${KEY}`] },
    { id: 'mistral', url: 'https://api.mistral.ai/v1/models', header: ['Authorization', `Bearer ${KEY}`] },
    { id: 'xai', url: 'https://api.x.ai/v1/models', header: ['Authorization', `Bearer ${KEY}`] },
    { id: 'deepseek', url: 'https://api.deepseek.com/models', header: ['Authorization', `Bearer ${KEY}`] },
    // AssemblyAI takes the raw key as the whole Authorization value
    { id: 'assemblyai', url: 'https://api.assemblyai.com/v2/transcript?limit=1', header: ['authorization', KEY] },
  ]

  it.each(cases)('$id: hits the documented endpoint with the key in a header only', async ({ id, url, header }) => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    const result = await PROVIDERS[id].validate(KEY)
    expect(result).toEqual({ ok: true, status: 200 })

    const [calledUrl, init] = firstCall()
    expect(calledUrl).toBe(url)
    expect(calledUrl).not.toContain(KEY)
    expect(init.method).toBe('GET')
    expect(init.headers[header[0]]).toBe(header[1])
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('Anthropic sends the pinned API version header', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    await PROVIDERS.anthropic.validate(KEY)
    expect(firstCall()[1].headers['anthropic-version']).toBe('2023-06-01')
  })

  it.each([401, 403, 400, 429, 500])('reports %i as not ok with the status', async (status) => {
    fetchMock.mockResolvedValue(json({ error: { message: `secret echo ${KEY}` } }, status))
    const result = await PROVIDERS.openai.validate(KEY)
    expect(result).toEqual({ ok: false, status })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('refuses redirects instead of following them', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }))
    const result = await PROVIDERS.openai.validate(KEY)
    expect(result).toEqual({ ok: false, status: 302, reason: 'redirect' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a fetch timeout to reason=timeout (no status)', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    expect(await PROVIDERS.groq.validate(KEY)).toEqual({ ok: false, reason: 'timeout' })
  })

  it('maps any other fetch failure to reason=network', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await PROVIDERS.mistral.validate(KEY)).toEqual({ ok: false, reason: 'network' })
  })
})

describe('listModels', () => {
  it('OpenAI-style: ids from data[], inactive Groq models dropped, caps inferred from the id', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          { id: 'gpt-5.1' },
          { id: 'whisper-1' },
          { id: 'gpt-realtime' },
          { id: 'text-embedding-3-small' },
          { id: 'gpt-5.1' },
        ],
      }),
    )
    const models = await PROVIDERS.openai.listModels(KEY)
    expect(models.map((m) => m.id)).toEqual(['gpt-5.1', 'whisper-1', 'gpt-realtime', 'text-embedding-3-small'])
    expect(models[0].caps).toMatchObject({ language: true, tools: true, structured: true, vision: true })
    expect(models[1].caps).toEqual({ stt: true })
    expect(models[2].caps).toEqual({ realtime: true })
    expect(models[3].caps).toEqual({})

    fetchMock.mockResolvedValue(json({ data: [{ id: 'llama-3.3-70b-versatile', active: true }, { id: 'old', active: false }] }))
    expect((await PROVIDERS.groq.listModels(KEY)).map((m) => m.id)).toEqual(['llama-3.3-70b-versatile'])
  })

  it('Anthropic: reads display_name and provider-reported vision / structured support', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          {
            id: 'claude-x',
            display_name: 'Claude X',
            capabilities: { image_input: { supported: false }, structured_outputs: { supported: true } },
          },
        ],
        has_more: false,
      }),
    )
    const [m] = await PROVIDERS.anthropic.listModels(KEY)
    expect(m).toMatchObject({ id: 'claude-x', label: 'Claude X' })
    expect(m.caps).toMatchObject({ vision: false, structured: true, tools: true })
    expect(firstCall()[0]).toBe('https://api.anthropic.com/v1/models?limit=1000')
  })

  it('Google: strips the models/ prefix and drops embedding-only models', async () => {
    fetchMock.mockResolvedValue(
      json({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-live-x', supportedGenerationMethods: ['bidiGenerateContent'] },
        ],
      }),
    )
    const models = await PROVIDERS.google.listModels(KEY)
    expect(models.map((m) => m.id)).toEqual(['gemini-2.5-flash', 'gemini-live-x'])
    expect(models[0]).toMatchObject({ label: 'Gemini 2.5 Flash', caps: { language: true, vision: true } })
    expect(models[1].caps).toMatchObject({ realtime: true })
  })

  it('OpenRouter: capabilities come from architecture + supported_parameters', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          {
            id: 'acme/vision-1',
            name: 'Vision One',
            architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
            supported_parameters: ['tools', 'structured_outputs'],
          },
          {
            id: 'acme/plain-1',
            name: 'Plain',
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
            supported_parameters: ['temperature'],
          },
        ],
      }),
    )
    const [vision, plain] = await PROVIDERS.openrouter.listModels(KEY)
    expect(vision.caps).toMatchObject({ vision: true, tools: true, structured: true, language: true })
    expect(plain.caps).toMatchObject({ vision: false, tools: false, structured: false })
  })

  it('Mistral: uses the capabilities block, skips archived models', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          { id: 'mistral-small-latest', capabilities: { completion_chat: true, function_calling: true, vision: true } },
          { id: 'old', archived: true },
        ],
      }),
    )
    const models = await PROVIDERS.mistral.listModels(KEY)
    expect(models.map((m) => m.id)).toEqual(['mistral-small-latest'])
    expect(models[0].caps).toMatchObject({ language: true, tools: true, vision: true })
  })

  it('DeepSeek: vision follows input_modalities', async () => {
    fetchMock.mockResolvedValue(
      json({ data: [{ id: 'deepseek-flash', name: 'Flash', input_modalities: ['text', 'image'] }] }),
    )
    const [m] = await PROVIDERS.deepseek.listModels(KEY)
    expect(m.caps).toMatchObject({ vision: true, language: true })
  })

  it('AssemblyAI: static catalog, no network', async () => {
    const models = await PROVIDERS.assemblyai.listModels(KEY)
    expect(models.map((m) => m.id)).toEqual(['universal-3-5-pro', 'universal-2'])
    expect(models.every((m) => m.caps?.stt)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401/403 become AiKeyInvalidError carrying the provider', async () => {
    fetchMock.mockResolvedValue(json({ error: `bad ${KEY}` }, 401))
    const err = await PROVIDERS.xai.listModels(KEY).catch((e) => e)
    expect(err).toBeInstanceOf(AiKeyInvalidError)
    expect(err.providerId).toBe('xai')
    expect(`${err.message} ${JSON.stringify(err)}`).not.toContain(KEY)
  })

  it('5xx, redirect, timeout and non-JSON bodies become AiProviderError', async () => {
    fetchMock.mockResolvedValue(json({}, 503))
    expect(await PROVIDERS.openai.listModels(KEY).catch((e) => e)).toBeInstanceOf(AiProviderError)

    fetchMock.mockResolvedValue(new Response(null, { status: 307, headers: { location: 'https://evil.example' } }))
    expect(await PROVIDERS.openai.listModels(KEY).catch((e) => e)).toBeInstanceOf(AiProviderError)

    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const timeout = await PROVIDERS.openai.listModels(KEY).catch((e) => e)
    expect(timeout).toBeInstanceOf(AiProviderError)
    expect(timeout.transient).toBe(true)

    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await PROVIDERS.openai.listModels(KEY).catch((e) => e)).toBeInstanceOf(AiProviderError)
  })
})

describe('create: the tenant key is the only credential', () => {
  const headerOf: Record<Exclude<ProviderId, 'assemblyai'>, (h: Headers) => string | null> = {
    openai: (h) => h.get('authorization'),
    anthropic: (h) => h.get('x-api-key'),
    google: (h) => h.get('x-goog-api-key'),
    openrouter: (h) => h.get('authorization'),
    groq: (h) => h.get('authorization'),
    mistral: (h) => h.get('authorization'),
    xai: (h) => h.get('authorization'),
    deepseek: (h) => h.get('authorization'),
  }

  it.each(Object.keys(headerOf) as Exclude<ProviderId, 'assemblyai'>[])(
    '%s sends the key it was built with, ignoring platform env keys',
    async (id) => {
      // A platform-level key in the environment must never be what goes out.
      vi.stubEnv('OPENAI_API_KEY', 'platform-openai-key')
      vi.stubEnv('ANTHROPIC_API_KEY', 'platform-anthropic-key')
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'platform-google-key')
      vi.stubEnv('GROQ_API_KEY', 'platform-groq-key')
      vi.stubEnv('MISTRAL_API_KEY', 'platform-mistral-key')
      vi.stubEnv('XAI_API_KEY', 'platform-xai-key')
      vi.stubEnv('DEEPSEEK_API_KEY', 'platform-deepseek-key')
      vi.stubEnv('OPENROUTER_API_KEY', 'platform-openrouter-key')

      fetchMock.mockResolvedValue(json({ error: 'stub' }, 500))
      const model = createProviderInstance(id, KEY).languageModel('some-model')
      await generateText({ model, prompt: 'hi', maxRetries: 0 }).catch(() => undefined)

      expect(fetchMock).toHaveBeenCalled()
      const init = fetchMock.mock.calls[0][1] as RequestInit
      const value = headerOf[id](new Headers(init.headers as HeadersInit))
      expect(value).toContain(KEY)
      expect(value).not.toContain('platform-')
    },
  )

  it('refuses to build a provider without a key', () => {
    expect(() => createProviderInstance('openai', '')).toThrow(AiKeyInvalidError)
  })

  it('kinds a provider does not serve throw AiModelUnsupportedError', () => {
    const anthropic = createProviderInstance('anthropic', KEY)
    expect(() => anthropic.imageModel('x')).toThrow(AiModelUnsupportedError)
    expect(() => anthropic.transcriptionModel('x')).toThrow(AiModelUnsupportedError)
    expect(anthropic.realtime).toBeUndefined()

    const assembly = createProviderInstance('assemblyai', KEY)
    expect(() => assembly.languageModel('x')).toThrow(AiModelUnsupportedError)
  })

  it('OpenAI, xAI and Google expose realtime; Groq and OpenAI expose transcription', () => {
    expect(createProviderInstance('openai', KEY).realtime).toBeDefined()
    expect(createProviderInstance('xai', KEY).realtime).toBeDefined()
    expect(createProviderInstance('google', KEY).realtime).toBeDefined()
    expect(createProviderInstance('deepseek', KEY).realtime).toBeUndefined()
    expect(createProviderInstance('groq', KEY).transcriptionModel('whisper-large-v3')).toBeTruthy()
    expect(createProviderInstance('openai', KEY).transcriptionModel('whisper-1')).toBeTruthy()
  })
})

describe('AI_PROVIDER_BASE_URL_OVERRIDE (test hook)', () => {
  it('routes to <override>/<provider> outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AI_PROVIDER_BASE_URL_OVERRIDE', 'http://localhost:4010/')
    expect(providerBaseUrl('openai')).toBe('http://localhost:4010/openai')

    fetchMock.mockResolvedValue(json({ data: [] }))
    await PROVIDERS.anthropic.validate(KEY)
    expect(firstCall()[0]).toBe('http://localhost:4010/anthropic/models?limit=1')
  })

  it('is ignored in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AI_PROVIDER_BASE_URL_OVERRIDE', 'http://localhost:4010')
    expect(providerBaseUrl('openai')).toBe('https://api.openai.com/v1')
  })

  it('ignores values that are not http(s) URLs', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AI_PROVIDER_BASE_URL_OVERRIDE', 'file:///etc/passwd')
    expect(providerBaseUrl('openai')).toBe('https://api.openai.com/v1')
    vi.stubEnv('AI_PROVIDER_BASE_URL_OVERRIDE', 'not a url')
    expect(providerBaseUrl('openai')).toBe('https://api.openai.com/v1')
  })
})
