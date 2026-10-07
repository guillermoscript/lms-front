import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const sdk = vi.hoisted(() => ({ transcribe: vi.fn() }))
vi.mock('ai', () => ({ transcribe: sdk.transcribe }))

import { AiKeyInvalidError, AiModelUnsupportedError } from '@/lib/ai/errors'
import { transcribeWithProvider } from '@/lib/ai/transcription'
import type { ProviderInstance } from '@/lib/ai/providers'

const instance = (id: string) =>
  ({
    id,
    transcriptionModel: (m: string) => ({ modelId: m }),
    languageModel: () => {
      throw new Error('unused')
    },
    imageModel: () => {
      throw new Error('unused')
    },
  }) as unknown as ProviderInstance

const base = { apiKey: 'sk-test-0123456789', audio: Buffer.from('audio') }

describe('transcribeWithProvider via the AI SDK', () => {
  beforeEach(() => sdk.transcribe.mockReset())

  it('maps word segments to ms word timestamps and asks for word granularity only', async () => {
    sdk.transcribe.mockResolvedValue({
      text: 'hello world',
      segments: [
        { text: 'hello', startSecond: 0, endSecond: 0.4 },
        { text: ' world', startSecond: 0.5, endSecond: 1.0 },
      ],
      durationInSeconds: 1.2,
      language: 'en',
    })
    const out = await transcribeWithProvider({
      ...base,
      providerId: 'openai',
      modelId: 'whisper-1',
      instance: instance('openai'),
      options: { language: 'en' },
    })
    expect(out.words).toEqual([
      { word: 'hello', start_ms: 0, end_ms: 400, confidence: 1 },
      { word: 'world', start_ms: 500, end_ms: 1000, confidence: 1 },
    ])
    expect(out).toMatchObject({ text: 'hello world', durationSeconds: 1.2, language: 'en' })
    expect(sdk.transcribe.mock.calls[0][0].providerOptions).toEqual({
      openai: { timestampGranularities: ['word'], language: 'en' },
    })
  })

  it('groq needs verbose_json for word timings', async () => {
    sdk.transcribe.mockResolvedValue({ text: 'a', segments: [{ text: 'a', startSecond: 0, endSecond: 1 }] })
    await transcribeWithProvider({ ...base, providerId: 'groq', modelId: 'whisper-large-v3', instance: instance('groq') })
    expect(sdk.transcribe.mock.calls[0][0].providerOptions).toEqual({
      groq: { responseFormat: 'verbose_json', timestampGranularities: ['word'] },
    })
  })

  it('multi-word segments mean the model gave no word timings: ai_model_unsupported', async () => {
    sdk.transcribe.mockResolvedValue({
      text: 'hello big world',
      segments: [{ text: 'hello big world', startSecond: 0, endSecond: 2 }],
    })
    const err = await transcribeWithProvider({
      ...base,
      providerId: 'openai',
      modelId: 'gpt-4o-transcribe',
      instance: instance('openai'),
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AiModelUnsupportedError)
    expect(err.missing).toEqual(['word_timestamps'])
  })

  it('empty audio (no text, no words) is an empty transcript, not an error', async () => {
    sdk.transcribe.mockResolvedValue({ text: '', segments: [] })
    const out = await transcribeWithProvider({ ...base, providerId: 'openai', modelId: 'whisper-1', instance: instance('openai') })
    expect(out.words).toEqual([])
    expect(out.durationSeconds).toBe(0)
  })
})

describe('transcribeWithProvider via AssemblyAI REST', () => {
  const realFetch = globalThis.fetch
  let calls: { url: string; init?: RequestInit }[]

  beforeEach(() => {
    calls = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.useRealTimers()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  function stub(handler: (url: string, init?: RequestInit) => Response) {
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return handler(String(url), init)
    }) as typeof fetch
  }

  const run = (extra: object = {}) =>
    transcribeWithProvider({
      ...base,
      providerId: 'assemblyai',
      modelId: 'universal-2',
      instance: instance('assemblyai'),
      options: { language: 'es', verbatim: true },
      ...extra,
    })

  it('uploads, submits, polls and returns words; the raw key is the whole authorization header', async () => {
    stub((url) => {
      if (url.endsWith('/upload')) return json({ upload_url: 'https://cdn/aai/1' })
      if (url.endsWith('/transcript')) return json({ id: 'tr_1' })
      return json({
        status: 'completed',
        text: 'hola mundo',
        audio_duration: 2,
        language_code: 'es',
        words: [
          { text: 'hola', start: 0, end: 500, confidence: 0.9 },
          { text: 'mundo', start: 600, end: 1100 },
        ],
      })
    })
    const p = run()
    await vi.advanceTimersByTimeAsync(3000)
    const out = await p
    expect(out.words).toEqual([
      { word: 'hola', start_ms: 0, end_ms: 500, confidence: 0.9 },
      { word: 'mundo', start_ms: 600, end_ms: 1100, confidence: 1 },
    ])
    expect(out).toMatchObject({ text: 'hola mundo', durationSeconds: 2, language: 'es' })
    for (const c of calls) expect((c.init?.headers as Record<string, string>).authorization).toBe(base.apiKey)
    const submit = JSON.parse(String(calls.find((c) => c.url.endsWith('/transcript') && c.init?.method === 'POST')?.init?.body))
    expect(submit).toMatchObject({ audio_url: 'https://cdn/aai/1', speech_models: ['universal-2'], format_text: false, language_code: 'es' })
  })

  it('a 401 on upload is key_invalid and the response body is never copied', async () => {
    stub(() => json({ error: 'Invalid API key sk-test-0123456789 echoed back' }, 401))
    const err = await run().catch((e) => e)
    expect(err).toBeInstanceOf(AiKeyInvalidError)
    expect(JSON.stringify(err)).not.toContain('echoed')
    expect(String(err.message)).not.toContain('sk-test')
  })

  it('completed text without word timings is ai_model_unsupported', async () => {
    stub((url) => {
      if (url.endsWith('/upload')) return json({ upload_url: 'u' })
      if (url.endsWith('/transcript')) return json({ id: 'tr_2' })
      return json({ status: 'completed', text: 'hello', words: [] })
    })
    const p = run().catch((e) => e)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toBeInstanceOf(AiModelUnsupportedError)
  })
})
