import { z } from 'zod'
import { buildAudioConfig, buildConversationConfig } from './form-config'
import type { ExerciseFormData } from '@/app/actions/teacher/exercises'

export const PreviewDraftSchema = z.object({
  courseId: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).default(''),
  instructions: z.string().max(30_000).default(''),
  system_prompt: z.string().max(30_000).default(''),
  exercise_type: z.enum(['essay', 'discussion', 'quiz', 'multiple_choice', 'true_false', 'fill_in_the_blank', 'coding_challenge', 'audio_evaluation', 'video_evaluation', 'real_time_conversation', 'artifact']),
  difficulty_level: z.string().max(30).default('medium'),
  time_limit: z.number().min(0).max(1440).default(30),
  exercise_config: z.record(z.string(), z.unknown()).default({}).refine(
    (config) => JSON.stringify(config).length <= 200_000,
    'Exercise configuration is too large'
  ),
})
export type PreviewDraft = z.infer<typeof PreviewDraftSchema>

/** Same normalization as Save; the live editor draft takes precedence over stored config. */
export function buildPreviewDraft(courseId: number, form: ExerciseFormData, storedConfig: Record<string, unknown> = {}): PreviewDraft {
  const config = form.exercise_type === 'real_time_conversation'
    ? { ...buildConversationConfig(form) }
    : form.exercise_type === 'audio_evaluation' || form.exercise_type === 'video_evaluation'
      ? buildAudioConfig(form)
      : storedConfig
  return {
    courseId, title: form.title, description: form.description,
    instructions: form.instructions, system_prompt: form.system_prompt,
    exercise_type: form.exercise_type as PreviewDraft['exercise_type'],
    difficulty_level: form.difficulty_level, time_limit: form.time_limit,
    exercise_config: config,
  }
}
