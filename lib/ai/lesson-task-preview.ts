import type { LanguageModel } from 'ai'
import { PROMPTS } from '@/lib/ai/prompts'
import { createPreviewLessonTools } from '@/lib/ai/tools'
import { verifyLessonCompletion } from '@/lib/ai/lesson-completion-verifier'
import { requirementIds, type StructuredRequirements } from '@/lib/ai/lesson-requirements'

/** A lesson AI task config as the teacher edits it (draft) or a version snapshot holds it. */
export interface LessonTaskConfig {
  task_instructions?: string
  system_prompt?: string
  requirements?: StructuredRequirements | null
}

export interface LessonTaskLesson {
  title?: string
  description?: string
  content?: string
}

interface TranscriptMessage {
  role?: string
  parts?: { type?: string; text?: string }[]
}

/**
 * The tutor a student would get, with the dry-run completion tool: the teacher
 * preview streams it, AI task tests (lib/ai/evals) run it turn by turn. One
 * builder, so a test always exercises exactly what the preview shows.
 */
export function buildPreviewLessonTask(input: {
  verifierModel: LanguageModel
  lesson: LessonTaskLesson
  config: LessonTaskConfig
  /** The full transcript so far — the verifier's evidence. */
  messages: TranscriptMessage[]
  onProviderError?: (error: unknown) => void
}) {
  const requirements = input.config.requirements ?? null
  return {
    system: PROMPTS.previewLesson(input.lesson, {
      task_instructions: input.config.task_instructions || undefined,
      system_prompt: input.config.system_prompt || undefined,
      requirements,
    }),
    tools: createPreviewLessonTools(
      () => verifyLessonCompletion({
        model: input.verifierModel,
        taskInstructions: input.config.task_instructions,
        teacherPrompt: input.config.system_prompt,
        structuredRequirements: requirements,
        messages: input.messages,
        onProviderError: input.onProviderError,
      }),
      requirementIds(requirements)
    ),
  }
}
