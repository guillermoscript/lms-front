import type { FillerEvent, PauseEvent, TranscriptionResult, WordTimestamp } from './types'

/**
 * Speech metrics (fillers, pace, pauses) derived from word timestamps. Pure and
 * provider-agnostic: every STT backend (AssemblyAI, Whisper via OpenAI/Groq)
 * hands over the same `{text, words[], durationSeconds}` and gets the same
 * metrics. Filler detection is only as good as the transcript: Whisper-class
 * models tend to drop disfluencies, AssemblyAI keeps them (`disfluencies: true`).
 */

const FILLER_WORDS = new Set([
  'um', 'uh', 'er', 'ah', 'like', 'you know', 'basically', 'literally',
  'actually', 'so', 'right', 'okay', 'well', 'hmm', 'umm', 'uhh',
  // Spanish fillers
  'este', 'esteee', 'o sea', 'pues', 'bueno', 'verdad', 'entonces',
])

// Pause thresholds (ms)
const PAUSE_HESITATION_MIN = 300
const PAUSE_GOOD_MIN = 800
const PAUSE_MAX = 5000 // above this is probably a stop

const normalize = (word: string) => word.toLowerCase().replace(/[.,!?]/g, '')

export interface WordLevelTranscript {
  text: string
  words: WordTimestamp[]
  durationSeconds: number
}

export function buildTranscriptionResult(data: WordLevelTranscript): TranscriptionResult {
  const { words } = data
  const duration_seconds = data.durationSeconds > 0 ? data.durationSeconds : (words.at(-1)?.end_ms ?? 0) / 1000

  const filler_words: FillerEvent[] = []
  for (const w of words) {
    const normalized = normalize(w.word)
    if (!FILLER_WORDS.has(normalized)) continue
    const existing = filler_words.find((f) => f.word === normalized)
    if (existing) existing.count++
    else filler_words.push({ word: normalized, timestamp_ms: w.start_ms, count: 1 })
  }

  // Exclude filler words from the pace count for a cleaner metric
  const meaningful = words.filter((w) => !FILLER_WORDS.has(normalize(w.word)))
  const wpm = duration_seconds > 0 ? Math.round((meaningful.length / duration_seconds) * 60) : 0

  const pauses: PauseEvent[] = []
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start_ms - words[i - 1].end_ms
    if (gap >= PAUSE_HESITATION_MIN && gap <= PAUSE_MAX) {
      pauses.push({
        start_ms: words[i - 1].end_ms,
        end_ms: words[i].start_ms,
        duration_ms: gap,
        type: gap >= PAUSE_GOOD_MIN ? 'good' : 'hesitation',
      })
    }
  }

  return { transcript: data.text, words, filler_words, wpm, pauses, duration_seconds }
}
