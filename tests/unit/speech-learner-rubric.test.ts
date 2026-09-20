import { describe, it, expect } from 'vitest'
import {
  SPEECH_RUBRIC_DEFAULTS,
  buildLearnerSpeechPrompt,
  feedbackLanguageInstruction,
  parseSpeechRubricConfig,
  unclearWords,
} from '@/lib/speech/learner-rubric'
import { PROMPTS } from '@/lib/ai/prompts'

const metrics = {
  wpm: 74,
  filler_count: 3,
  pause_count: 6,
  long_pause_count: 2,
  avg_pause_duration_ms: 900,
  duration_seconds: 41,
}
const exercise = { title: 'My weekend', instructions: 'Say what you did last weekend.' }

describe('parseSpeechRubricConfig', () => {
  it('an exercise saved before the rubric existed stays a public-speaking one', () => {
    expect(parseSpeechRubricConfig(null)).toEqual(SPEECH_RUBRIC_DEFAULTS)
    expect(parseSpeechRubricConfig({ topic_prompt: 'x', rubric: { pace: true } }).rubric_mode).toBe('public_speaking')
  })

  it('rejects a mode, level or language it does not know', () => {
    const config = parseSpeechRubricConfig({
      rubric_mode: 'vibes',
      level: 'Z9',
      target_language: 'english; drop table',
      feedback_language: 'ES',
    })
    expect(config).toEqual(SPEECH_RUBRIC_DEFAULTS)
  })
})

describe('buildLearnerSpeechPrompt', () => {
  const rubric = parseSpeechRubricConfig({
    rubric_mode: 'language_learner',
    target_language: 'en',
    level: 'A2',
    feedback_language: 'es',
  })

  it('grades the language to the level and answers in the student’s language', () => {
    const text = buildLearnerSpeechPrompt(exercise, rubric, metrics, [])
    expect(text).toContain('practising English at CEFR level A2')
    expect(text).toContain('Grammar and accuracy')
    expect(text).toContain('feedback in Spanish')
  })

  it('never holds a learner to a keynote pace', () => {
    expect(buildLearnerSpeechPrompt(exercise, rubric, metrics, [])).not.toContain('120')
  })

  it('offers low-confidence words as a lead, not a verdict', () => {
    const text = buildLearnerSpeechPrompt(exercise, rubric, metrics, ['thought', 'comfortable'])
    expect(text).toContain('thought, comfortable')
    expect(text).toContain('or just noise')
    expect(buildLearnerSpeechPrompt(exercise, rubric, metrics, [])).not.toContain('recogniser')
  })
})

describe('unclearWords', () => {
  it('keeps distinct low-confidence content words and caps the list', () => {
    const words = [
      { word: 'I', confidence: 0.2 },
      { word: 'Thought,', confidence: 0.31 },
      { word: 'thought', confidence: 0.4 },
      { word: 'weekend', confidence: 0.97 },
      ...Array.from({ length: 30 }, (_, i) => ({ word: `word${'abcdefghijklmnopqrstuvwxyzabcd'[i]}x`, confidence: 0.1 })),
    ]
    const result = unclearWords(words)
    expect(result[0]).toBe('thought')
    expect(result).not.toContain('i')
    expect(result).not.toContain('weekend')
    expect(result.length).toBe(12)
  })
})

describe('the public-speaking coach', () => {
  it('no longer orders the model to call a tool it is never given', () => {
    expect(PROMPTS.speechCoach(exercise, metrics)).not.toContain('markExerciseCompleted')
  })

  it('answers in the teacher’s feedback language when one is set', () => {
    const text = PROMPTS.speechCoach(
      { ...exercise, feedbackLanguageInstruction: feedbackLanguageInstruction('es') },
      metrics
    )
    expect(text).toContain('in Spanish')
    expect(PROMPTS.speechCoach(exercise, metrics)).toContain('the language the student spoke in')
  })
})
