import type { ExerciseFormData } from '@/app/actions/teacher/exercises'
import { parseConversationConfig } from '@/lib/speech/conversation'
import { parseSpeechRubricConfig } from '@/lib/speech/learner-rubric'

/** Normalised through the same parser the token route reads it with. */
export function buildConversationConfig(data: ExerciseFormData) {
  return parseConversationConfig({
    scenario: data.conv_scenario,
    evaluation_criteria: data.conv_evaluation_criteria,
    target_language: data.conv_target_language,
    native_language: data.conv_native_language,
    level: data.conv_level,
    voice: data.conv_voice,
    max_minutes: data.conv_max_minutes,
    passing_score: data.passing_score,
    max_daily_attempts: data.max_daily_attempts || 0,
  })
}

export function buildAudioConfig(data: ExerciseFormData) {
  return {
    // STT and the coach model are the school's, set under Settings > AI (speech_stt / speech_coach).
    topic_prompt: data.topic_prompt,
    min_duration_seconds: data.min_duration_seconds,
    max_duration_seconds: data.max_duration_seconds,
    passing_score: data.passing_score,
    max_daily_attempts: data.max_daily_attempts || 0,
    rubric: {
      filler_words: data.rubric_filler_words,
      pace: data.rubric_pace,
      structure: data.rubric_structure,
      confidence: data.rubric_confidence,
    },
    // Normalised through the same parser the analyze route reads it with.
    ...parseSpeechRubricConfig({
      rubric_mode: data.speech_rubric_mode,
      target_language: data.speech_target_language,
      level: data.speech_level,
      feedback_language: data.speech_feedback_language,
    }),
  }
}

