import type { STTProvider, SpeechCoach, SpeechEvaluation, ExerciseContext, SpeechCoachOptions } from './types'

/** Where the recording is: raw bytes, a `data:` URL (staff previews) or an https URL (signed Storage URL). */
export type AudioSource = string | URL | Buffer | Uint8Array

/** The recording itself could not be read (not a provider failure). */
export class SpeechAudioError extends Error {
  constructor(readonly reason: 'unavailable' | 'too_large' | 'invalid') {
    super(`speech audio ${reason}`)
    this.name = 'SpeechAudioError'
  }
}

const MAX_AUDIO_BYTES = 100 * 1024 * 1024

/**
 * Bytes for the transcriber. Fetching here (instead of handing a URL to the
 * provider) means every STT backend gets the same input, a private Storage URL
 * never leaves our servers, and nothing downloads an attacker-chosen URL.
 */
export async function loadAudio(source: AudioSource): Promise<Buffer | Uint8Array> {
  if (typeof source !== 'string' && !(source instanceof URL)) {
    if (source.byteLength > MAX_AUDIO_BYTES) throw new SpeechAudioError('too_large')
    return source
  }
  const href = typeof source === 'string' ? source : source.href
  if (href.startsWith('data:')) {
    const comma = href.indexOf(',')
    if (comma < 0) throw new SpeechAudioError('invalid')
    const meta = href.slice(5, comma)
    const body = href.slice(comma + 1)
    const buf = meta.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'binary')
    if (buf.byteLength > MAX_AUDIO_BYTES) throw new SpeechAudioError('too_large')
    return buf
  }
  const res = await fetch(href, { redirect: 'error', cache: 'no-store' }).catch(() => null)
  if (!res?.ok) throw new SpeechAudioError('unavailable')
  if (Number(res.headers.get('content-length') ?? 0) > MAX_AUDIO_BYTES) throw new SpeechAudioError('too_large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_AUDIO_BYTES) throw new SpeechAudioError('too_large')
  return buf
}

export async function runSpeechPipeline(
  audio: AudioSource,
  exerciseContext: ExerciseContext,
  providers: { stt: STTProvider; coach: SpeechCoach },
  options?: SpeechCoachOptions
): Promise<SpeechEvaluation> {
  const rubric = exerciseContext.speechRubric
  const bytes = await loadAudio(audio)
  // A learner is graded on their own wording, in a language we already know.
  const transcription = await providers.stt.transcribe(
    bytes,
    rubric?.rubric_mode === 'language_learner' ? { language: rubric.target_language, verbatim: true } : undefined
  )
  const evaluation = await providers.coach.evaluate(transcription, exerciseContext, options)
  return evaluation
}
