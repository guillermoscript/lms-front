import { describe, expect, it } from 'vitest'
import { buildPreviewDraft, PreviewDraftSchema } from '@/lib/exercises/preview'
import { buildAudioConfig, buildConversationConfig } from '@/lib/exercises/form-config'
import type { ExerciseFormData } from '@/app/actions/teacher/exercises'

const form: ExerciseFormData = {
  title: 'Current title', description: 'Current description', instructions: 'Current instructions',
  exercise_type: 'essay', difficulty_level: 'medium', time_limit: 30, system_prompt: 'Current private prompt', status: 'draft', publish: false,
  topic_prompt: 'Introduce yourself', min_duration_seconds: 5, max_duration_seconds: 60, passing_score: 80, max_daily_attempts: 3,
  rubric_filler_words: true, rubric_pace: true, rubric_structure: true, rubric_confidence: true,
  speech_rubric_mode: 'language_learner', speech_target_language: 'en', speech_level: 'A2', speech_feedback_language: 'es',
  conv_scenario: 'Order coffee', conv_evaluation_criteria: 'Confirm the price', conv_target_language: 'en', conv_native_language: 'es',
  conv_level: 'A2', conv_voice: 'marin', conv_max_minutes: 3,
}

describe('exercise preview snapshot', () => {
  it('takes unsaved text and prompt edits but preserves stored answer keys/rubric', () => {
    const config = { evaluation_criteria: 'Specific task', questions: [{ id: '1', correctIndex: 0 }] }
    const draft = buildPreviewDraft(2, form, config)
    expect(draft.instructions).toBe('Current instructions')
    expect(draft.system_prompt).toBe('Current private prompt')
    expect(draft.exercise_config).toEqual(config)
    expect(PreviewDraftSchema.safeParse(draft).success).toBe(true)
  })
  it('uses the exact Save normalization for realtime and current criteria', () => {
    const current = { ...form, exercise_type: 'real_time_conversation', conv_max_minutes: 999 }
    const preview = buildPreviewDraft(2, current, { scenario: 'Old scenario', evaluation_criteria: 'Old criteria' })
    expect(preview.exercise_config).toEqual(buildConversationConfig(current))
    expect(preview.exercise_config.scenario).toBe('Order coffee')
    expect(preview.exercise_config.evaluation_criteria).toBe('Confirm the price')
    expect(preview.exercise_config.max_minutes).toBe(15)
  })
  it.each(['audio_evaluation', 'video_evaluation'])('uses the exact Save normalization for %s', (exercise_type) => {
    const current = { ...form, exercise_type }
    expect(buildPreviewDraft(2, current).exercise_config).toEqual(buildAudioConfig(current))
  })
  it('rejects unsupported types and oversized drafts before use', () => {
    expect(PreviewDraftSchema.safeParse({ ...buildPreviewDraft(2, form), exercise_type: 'unknown' }).success).toBe(false)
    expect(PreviewDraftSchema.safeParse({ ...buildPreviewDraft(2, form), system_prompt: 'x'.repeat(30_001) }).success).toBe(false)
  })
})
