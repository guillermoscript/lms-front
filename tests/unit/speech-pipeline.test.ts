import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const sdk = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('ai', () => ({ generateText: sdk.generateText, Output: { object: (o: unknown) => o } }))

import { buildTranscriptionResult } from '@/lib/speech/metrics'
import { loadAudio, runSpeechPipeline, SpeechAudioError } from '@/lib/speech/pipeline'
import { getPipeline } from '@/lib/speech/registry'
import { TenantSttProvider } from '@/lib/speech/providers/tenant-stt'
import { ModelCoachProvider } from '@/lib/speech/coaches/model-coach'
import { buildAudioConfig } from '@/lib/exercises/form-config'
import type { WordTimestamp } from '@/lib/speech/types'

const w = (word: string, start_ms: number, end_ms: number): WordTimestamp => ({ word, start_ms, end_ms, confidence: 1 })

describe('buildTranscriptionResult', () => {
  it('derives fillers, pauses and pace from word timings', () => {
    const words = [w('Hello', 0, 400), w('um', 500, 700), w('world.', 1700, 2000)]
    const r = buildTranscriptionResult({ text: 'Hello um world.', words, durationSeconds: 2 })
    expect(r.filler_words).toEqual([{ word: 'um', timestamp_ms: 500, count: 1 }])
    // 2 meaningful words in 2s
    expect(r.wpm).toBe(60)
    expect(r.pauses).toEqual([{ start_ms: 700, end_ms: 1700, duration_ms: 1000, type: 'good' }])
    expect(r.duration_seconds).toBe(2)
  })

  it('falls back to the last word end when the provider gave no duration', () => {
    const r = buildTranscriptionResult({ text: 'a b', words: [w('a', 0, 500), w('b', 500, 3000)], durationSeconds: 0 })
    expect(r.duration_seconds).toBe(3)
  })

  it('handles an empty transcript', () => {
    const r = buildTranscriptionResult({ text: '', words: [], durationSeconds: 0 })
    expect(r).toMatchObject({ wpm: 0, pauses: [], filler_words: [], duration_seconds: 0 })
  })
})

describe('loadAudio', () => {
  it('passes bytes through and decodes data: URLs without a network call', async () => {
    const bytes = Buffer.from('abc')
    expect(await loadAudio(bytes)).toBe(bytes)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const out = await loadAudio(`data:audio/webm;base64,${bytes.toString('base64')}`)
    expect(Buffer.from(out).toString()).toBe('abc')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('refuses redirects and unreadable URLs with a typed error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 403 }))
    await expect(loadAudio('https://storage.example/a.webm')).rejects.toMatchObject({ name: 'SpeechAudioError', reason: 'unavailable' })
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
    fetchSpy.mockRestore()
  })

  it('rejects oversized input', async () => {
    const big = { byteLength: 101 * 1024 * 1024 } as unknown as Uint8Array
    await expect(loadAudio(big)).rejects.toBeInstanceOf(SpeechAudioError)
  })
})

describe('TenantSttProvider', () => {
  it('forwards language/verbatim to the tenant transcriber and adds metrics', async () => {
    const transcribe = vi.fn().mockResolvedValue({
      text: 'hola mundo',
      words: [w('hola', 0, 500), w('mundo', 600, 1000)],
      durationSeconds: 1,
    })
    const stt = new TenantSttProvider({ providerId: 'openai', transcribe })
    const audio = Buffer.from('x')
    const r = await stt.transcribe(audio, { language: 'es', verbatim: true })
    expect(stt.name).toBe('openai')
    expect(transcribe).toHaveBeenCalledWith(audio, { language: 'es', verbatim: true })
    expect(r.wpm).toBe(120)
  })
})

describe('getPipeline', () => {
  it('resolves the tenant transcriber and the speech_coach model, requiring structured output', async () => {
    const ai = {
      getTranscriber: vi.fn().mockResolvedValue({ providerId: 'groq', modelId: 'm', transcribe: vi.fn() }),
      getModelForFeature: vi.fn().mockResolvedValue({ model: { id: 'lm' }, providerId: 'anthropic', modelId: 'claude' }),
    }
    const p = await getPipeline(ai)
    expect(ai.getModelForFeature).toHaveBeenCalledWith('speech_coach', { require: ['structured'] })
    expect(p.stt.name).toBe('groq')
    expect(p.coach.name).toBe('anthropic')
  })

  it('propagates a not-configured error from either resolver (nothing falls back to a platform key)', async () => {
    const boom = new Error('ai_not_configured')
    await expect(
      getPipeline({ getTranscriber: vi.fn().mockRejectedValue(boom), getModelForFeature: vi.fn() }),
    ).rejects.toBe(boom)
    await expect(
      getPipeline({
        getTranscriber: vi.fn().mockResolvedValue({ providerId: 'openai', transcribe: vi.fn() }),
        getModelForFeature: vi.fn().mockRejectedValue(boom),
      }),
    ).rejects.toBe(boom)
  })
})

describe('runSpeechPipeline + ModelCoachProvider', () => {
  beforeEach(() => sdk.generateText.mockReset())

  it('transcribes the loaded bytes with a language hint for learners and grades with the injected model', async () => {
    sdk.generateText.mockResolvedValue({ output: { score: 82, strengths: ['a'], improvements: ['b'], focus_next: 'c', corrections: [] } })
    const transcribe = vi.fn().mockResolvedValue({
      text: 'hello there',
      words: [w('hello', 0, 400), w('there', 500, 900)],
      durationSeconds: 1,
    })
    const model = { id: 'tenant-model' } as never
    const evaluation = await runSpeechPipeline(
      Buffer.from('audio'),
      {
        title: 't',
        instructions: 'i',
        speechRubric: { rubric_mode: 'language_learner', target_language: 'en', level: 'A2', feedback_language: 'es' },
      },
      { stt: new TenantSttProvider({ providerId: 'openai', transcribe }), coach: new ModelCoachProvider(model, 'openai') },
    )
    expect(transcribe.mock.calls[0][1]).toEqual({ language: 'en', verbatim: true })
    expect(sdk.generateText.mock.calls[0][0].model).toBe(model)
    expect(evaluation.score).toBe(82)
    expect(evaluation.metrics.duration_seconds).toBe(1)
    expect(evaluation.annotated_transcript.map((s) => s.text.trim())).toEqual(['hello', 'there'])
  })
})

describe('buildAudioConfig', () => {
  it('no longer pins a speech provider or coach: those are the school\'s settings', () => {
    const config = buildAudioConfig({ passing_score: 70 } as never)
    expect(config).not.toHaveProperty('stt_provider')
    expect(config).not.toHaveProperty('ai_coach')
  })
})
