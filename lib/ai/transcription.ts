import 'server-only'

import { transcribe } from 'ai'

import { AiModelUnsupportedError, AiProviderError, classifyProviderError } from './errors'
import type { ProviderId } from './provider-ids'
import { providerBaseUrl, type ProviderInstance } from './providers'
import type { WordTimestamp } from '@/lib/speech/types'

/**
 * Word-level speech-to-text for one tenant's key. Called only by
 * lib/ai/tenant-ai.ts (`getTranscriber`), which owns key resolution; nothing
 * here reads an environment variable or logs a key.
 *
 * Speech metrics (wpm, pauses, fillers) need a timestamp per WORD, so a
 * transcript without word timings is an error (`missing: ['word_timestamps']`),
 * never a silent degrade. The metric derivation itself lives in lib/speech.
 */

export interface TenantTranscript {
  text: string
  /** One entry per spoken word, ms offsets from the start of the audio. Never empty for non-empty text. */
  words: WordTimestamp[]
  durationSeconds: number
  language?: string
}

export interface TranscribeOptions {
  /** ISO-639-1 hint ("en", "es"). */
  language?: string
  /** Keep the speaker's own wording: no casing/numeral clean-up (AssemblyAI `format_text`). */
  verbatim?: boolean
  abortSignal?: AbortSignal
}

export interface TranscribeInput {
  providerId: ProviderId
  modelId: string
  apiKey: string
  instance: ProviderInstance
  audio: Buffer | Uint8Array | URL
  options?: TranscribeOptions
}

const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const ASSEMBLY_POLL_INTERVAL_MS = 3000
const ASSEMBLY_POLL_ATTEMPTS = 30

export async function transcribeWithProvider(input: TranscribeInput): Promise<TenantTranscript> {
  return input.providerId === 'assemblyai' ? transcribeAssemblyAi(input) : transcribeViaSdk(input)
}

// --- AI SDK providers (OpenAI whisper-1, Groq whisper) ------------------------

function sdkProviderOptions(
  providerId: ProviderId,
  options: TranscribeOptions | undefined,
): Record<string, Record<string, string | string[]>> {
  const language = options?.language
  if (providerId === 'groq') {
    // Groq only honors word granularity with verbose_json
    return { groq: { responseFormat: 'verbose_json', timestampGranularities: ['word'], ...(language ? { language } : {}) } }
  }
  // 'word' alone: with 'segment' also requested the SDK returns segments, not words
  return { openai: { timestampGranularities: ['word'], ...(language ? { language } : {}) } }
}

async function transcribeViaSdk(input: TranscribeInput): Promise<TenantTranscript> {
  const { providerId, modelId, instance, audio, options } = input
  const result = await transcribe({
    model: instance.transcriptionModel(modelId),
    audio,
    providerOptions: sdkProviderOptions(providerId, options),
    abortSignal: options?.abortSignal,
  })

  const text = result.text ?? ''
  const segments = result.segments ?? []
  // With word granularity the SDK maps provider `words` into `segments`. If
  // those are real multi-word segments the model gave no word timings.
  const wordLevel = segments.length > 0 && segments.every((s) => s.text.trim().split(/\s+/).length === 1)
  if (text.trim() && !wordLevel) {
    throw new AiModelUnsupportedError({ providerId, missing: ['word_timestamps'] })
  }

  const words: WordTimestamp[] = segments.map((s) => ({
    word: s.text.trim(),
    start_ms: Math.round(s.startSecond * 1000),
    end_ms: Math.round(s.endSecond * 1000),
    confidence: 1,
  }))
  const last = words.at(-1)
  return {
    text,
    words,
    durationSeconds: result.durationInSeconds ?? (last ? last.end_ms / 1000 : 0),
    language: result.language,
  }
}

// --- AssemblyAI (REST; no AI SDK model) ---------------------------------------

interface AssemblyTranscript {
  status?: string
  text?: string | null
  language_code?: string | null
  audio_duration?: number | null
  words?: { text: string; start: number; end: number; confidence?: number }[] | null
}

/** Status-only failure: never carries AssemblyAI's response body. */
function assemblyFailure(providerId: ProviderId, status: number): Error {
  return classifyProviderError({ statusCode: status }, { providerId })
}

async function toBytes(audio: Buffer | Uint8Array | URL, signal?: AbortSignal): Promise<Uint8Array> {
  if (!(audio instanceof URL)) {
    if (audio.byteLength > MAX_AUDIO_BYTES) throw new AiProviderError({ providerId: 'assemblyai', upstreamStatus: 413 })
    return audio
  }
  // AssemblyAI cannot reach private/local Storage URLs, so the bytes go up from here.
  const res = await fetch(audio, { signal, redirect: 'error', cache: 'no-store' })
  if (!res.ok) throw new AiProviderError({ providerId: 'assemblyai', upstreamStatus: res.status >= 500 ? 400 : res.status })
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_AUDIO_BYTES) throw new AiProviderError({ providerId: 'assemblyai', upstreamStatus: 413 })
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_AUDIO_BYTES) throw new AiProviderError({ providerId: 'assemblyai', upstreamStatus: 413 })
  return buf
}

async function transcribeAssemblyAi(input: TranscribeInput): Promise<TenantTranscript> {
  const { apiKey, modelId, audio, options } = input
  const providerId: ProviderId = 'assemblyai'
  const base = providerBaseUrl(providerId)
  const auth = { authorization: apiKey }
  const signal = options?.abortSignal
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const bytes = await toBytes(audio, signal)
  const upload = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    body: bytes as BodyInit,
    redirect: 'manual',
    signal,
  })
  if (!upload.ok) throw assemblyFailure(providerId, upload.status)
  const uploadUrl = ((await upload.json()) as { upload_url?: string }).upload_url
  if (!uploadUrl) throw new AiProviderError({ providerId, upstreamStatus: 502 })

  const submit = await fetch(`${base}/transcript`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      audio_url: uploadUrl,
      speech_models: [modelId],
      punctuate: true,
      // Formatting tidies the text the grader reads; a language learner is graded on exactly what they said.
      format_text: !options?.verbatim,
      disfluencies: true,
      ...(options?.language ? { language_code: options.language } : {}),
    }),
    redirect: 'manual',
    signal,
  })
  if (!submit.ok) throw assemblyFailure(providerId, submit.status)
  const id = ((await submit.json()) as { id?: string }).id
  if (!id) throw new AiProviderError({ providerId, upstreamStatus: 502 })

  for (let attempt = 0; attempt < ASSEMBLY_POLL_ATTEMPTS; attempt++) {
    await sleep(ASSEMBLY_POLL_INTERVAL_MS)
    const poll = await fetch(`${base}/transcript/${encodeURIComponent(id)}`, {
      headers: auth,
      redirect: 'manual',
      signal,
      cache: 'no-store',
    })
    if (!poll.ok) throw assemblyFailure(providerId, poll.status)
    const data = (await poll.json()) as AssemblyTranscript
    if (data.status === 'error') throw new AiProviderError({ providerId, upstreamStatus: 422 })
    if (data.status === 'completed') return parseAssemblyTranscript(data)
  }
  throw new AiProviderError({ providerId, upstreamStatus: 408 })
}

function parseAssemblyTranscript(data: AssemblyTranscript): TenantTranscript {
  const raw = data.words ?? []
  const text = data.text ?? ''
  if (text.trim() && raw.length === 0) {
    throw new AiModelUnsupportedError({ providerId: 'assemblyai', missing: ['word_timestamps'] })
  }
  const words: WordTimestamp[] = raw.map((w) => ({
    word: w.text,
    start_ms: w.start,
    end_ms: w.end,
    confidence: w.confidence ?? 1,
  }))
  const durationSeconds = data.audio_duration ?? (raw.at(-1)?.end ?? 0) / 1000
  return { text, words, durationSeconds, language: data.language_code ?? undefined }
}
