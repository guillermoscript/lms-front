import { z } from 'zod'
import { CONVERSATION_LEVELS, languageName, type ConversationLevel } from './conversation'
import type { SpeechMetrics } from './types'

/**
 * How a recorded audio/video answer is graded.
 *
 * `public_speaking` is the original coach: pace, fillers, structure, delivery.
 * `language_learner` grades the language itself, relative to a CEFR level, and
 * writes the feedback in the student's own language — a Spanish beginner
 * practising English can't act on "aim for 120–160 WPM", least of all in English.
 */
export const SPEECH_RUBRIC_MODES = ['public_speaking', 'language_learner'] as const
export type SpeechRubricMode = (typeof SPEECH_RUBRIC_MODES)[number]

export interface SpeechRubricConfig {
  rubric_mode: SpeechRubricMode
  /** Learner mode only: the language being practised. */
  target_language: string
  level: ConversationLevel
  /** Language the feedback is written in. '' = the language the student spoke. */
  feedback_language: string
}

export const SPEECH_RUBRIC_DEFAULTS: SpeechRubricConfig = {
  rubric_mode: 'public_speaking',
  target_language: 'en',
  level: 'A2',
  feedback_language: '',
}

/** `exercises.exercise_config` is free-form jsonb — never trust its shape. */
export function parseSpeechRubricConfig(raw: unknown): SpeechRubricConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = SPEECH_RUBRIC_DEFAULTS
  const lang = (v: unknown, fallback: string) => (typeof v === 'string' && /^[a-z]{2}$/.test(v) ? v : fallback)
  return {
    rubric_mode: SPEECH_RUBRIC_MODES.includes(c.rubric_mode as SpeechRubricMode)
      ? (c.rubric_mode as SpeechRubricMode)
      : d.rubric_mode,
    target_language: lang(c.target_language, d.target_language),
    level: CONVERSATION_LEVELS.includes(c.level as ConversationLevel) ? (c.level as ConversationLevel) : d.level,
    feedback_language: lang(c.feedback_language, d.feedback_language),
  }
}

/** The sentence that decides what language the feedback comes back in. */
export function feedbackLanguageInstruction(feedbackLanguage: string): string {
  return feedbackLanguage
    ? `Write every piece of feedback in ${languageName(feedbackLanguage)}, whatever language the student spoke.`
    : 'Write the feedback in the language the student spoke in.'
}

export const SpeechCorrectionSchema = z.object({
  said: z.string().describe("The student's phrase, verbatim from the transcript"),
  better: z.string().describe('The corrected or more natural version'),
  why: z.string().describe('One short explanation'),
})
export type SpeechCorrection = z.infer<typeof SpeechCorrectionSchema>

/** Below this the recogniser was guessing — mispronunciation, or noise. */
const UNCLEAR_CONFIDENCE = 0.5
const MAX_UNCLEAR_WORDS = 12

/**
 * Per-word STT confidence as a pronunciation proxy. Weak evidence on its own
 * (a cough scores low too), so it is handed to the grader as a lead, capped,
 * and only in learner mode.
 */
export function unclearWords(words: { word: string; confidence: number }[]): string[] {
  const seen = new Set<string>()
  for (const w of words) {
    const clean = w.word.toLowerCase().replace(/[^\p{L}'-]/gu, '')
    if (clean.length > 2 && w.confidence < UNCLEAR_CONFIDENCE) seen.add(clean)
    if (seen.size >= MAX_UNCLEAR_WORDS) break
  }
  return [...seen]
}

export function buildLearnerSpeechPrompt(
  exercise: { title: string; instructions: string; topic_prompt?: string },
  rubric: SpeechRubricConfig,
  metrics: SpeechMetrics,
  unclear: string[]
): string {
  const target = languageName(rubric.target_language)
  return `You are grading a recorded spoken answer from a language student practising ${target} at CEFR level ${rubric.level}. The text is an automatic speech transcript, left unformatted so the student's own wording survives: ignore punctuation, capitalisation and obvious transcription glitches.

Exercise: ${exercise.title}
Task: ${exercise.instructions}
${exercise.topic_prompt ? `Topic prompt: ${exercise.topic_prompt}` : ''}

Delivery, for context only — a learner is not a keynote speaker, so never quote a words-per-minute target:
- Length: ${metrics.duration_seconds.toFixed(0)}s at ${metrics.wpm} words per minute
- Long pauses (>1.5s): ${metrics.long_pause_count}; hesitation sounds: ${metrics.filler_count}
${
  unclear.length
    ? `- The speech recogniser was unsure of: ${unclear.join(', ')}. That can mean unclear pronunciation or just noise — mention pronunciation only if these look like words a ${rubric.level} learner typically struggles to pronounce.`
    : ''
}

Grade relative to level ${rubric.level} — do not punish an A2 student for not sounding C1:
- Task achievement: did they answer what was asked, with enough content? (30%)
- Grammar and accuracy for their level (25%)
- Vocabulary range and appropriateness (20%)
- Fluency and intelligibility: can a patient listener follow them without effort? (25%)

If the answer is under about 15 words, or mostly not in ${target}, score below 40 and say that more ${target} is needed.

Return 2-3 strengths, 2-3 improvements, up to 5 "corrections" (the most useful ones; "said" verbatim from the transcript, "said" and "better" kept in ${target}), and one "focus_next": the single most useful thing to practise, ending with a short question the student can ask themselves before re-recording.
${feedbackLanguageInstruction(rubric.feedback_language)} Be specific and encouraging; quote the student.`
}
