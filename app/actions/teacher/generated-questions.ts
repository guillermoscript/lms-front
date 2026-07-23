'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { createLessonCheckpoint } from '@/app/actions/teacher/lesson-checkpoints'
import type { ApprovedQuestion } from '@/lib/lessons/generated-questions'

const MAX_ITEMS_PER_SAVE = 10

export interface SavedQuestionResult {
  title: string
  exerciseId: number
  checkpointCreated: boolean
}

/**
 * Persist teacher-approved AI question drafts (#398) as DRAFT exercises
 * linked to the lesson. Items approved with a video timestamp also get a
 * `lesson_checkpoints` row (placement 'video') so they surface inside the
 * lesson video (#392 infra). Drafts are never student-visible: the student
 * exercise list excludes drafts, and a draft with a checkpoint is exactly
 * the established "checkpoint-only" pattern.
 */
export async function saveApprovedQuestions(
  courseId: number,
  lessonId: number,
  items: ApprovedQuestion[]
) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    const { data: lesson } = await ctx.supabase
      .from('lessons')
      .select('id, course_id, video_url')
      .eq('id', lessonId)
      .eq('tenant_id', ctx.tenantId)
      .single()
    if (!lesson || lesson.course_id !== courseId) {
      throw new Error('Lesson not found in this course')
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No approved questions to save')
    }
    if (items.length > MAX_ITEMS_PER_SAVE) {
      throw new Error(`At most ${MAX_ITEMS_PER_SAVE} questions can be saved at once`)
    }

    const hasVideo = Boolean(lesson.video_url?.trim())
    const results: SavedQuestionResult[] = []

    for (const item of items) {
      const title = item.title?.trim()
      const prompt = item.prompt?.trim()
      if (!title || !prompt) throw new Error('Every question needs a title and a prompt')

      const { exerciseType, exerciseConfig } = mapToExercise(item)

      const { data: exercise, error } = await ctx.supabase
        .from('exercises')
        .insert({
          course_id: courseId,
          tenant_id: ctx.tenantId,
          lesson_id: lessonId,
          title,
          description: null,
          instructions: prompt,
          exercise_type: exerciseType,
          difficulty_level: item.difficulty,
          time_limit: 0,
          system_prompt: null,
          status: 'draft',
          created_by: ctx.userId,
          exercise_config: exerciseConfig,
        })
        .select('id')
        .single()
      if (error) throw error

      let checkpointCreated = false
      if (
        item.create_video_checkpoint &&
        hasVideo &&
        item.video_timestamp_seconds >= 0
      ) {
        const checkpoint = await createLessonCheckpoint({
          lessonId,
          exerciseId: exercise.id,
          placementType: 'video',
          videoTimestampSeconds: Math.round(item.video_timestamp_seconds),
          label: title,
          allowSkip: true,
          isRequired: false,
          isEnabled: true,
        })
        checkpointCreated = checkpoint.success
      }

      results.push({ title, exerciseId: exercise.id, checkpointCreated })
    }

    revalidatePath(`/dashboard/teacher/courses/${courseId}/exercises`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)

    return { saved: results }
  })
}

/**
 * Map a generated question to the exercise shape its kind grades through:
 * - short_answer → 'essay' (AI text grading via exercise_config.evaluation_criteria)
 * - fill_in_the_blank / multiple_choice → closed types graded deterministically
 *   from exercise_config.questions (lib/checkpoints/grading.ts shape)
 */
function mapToExercise(item: ApprovedQuestion): {
  exerciseType: string
  exerciseConfig: Record<string, unknown>
} {
  const rubric = item.rubric?.trim() || ''
  const explanation = item.explanation?.trim() || ''

  if (item.kind === 'short_answer') {
    const keywords = (item.expected_keywords ?? []).map((k) => k.trim()).filter(Boolean)
    const criteria =
      rubric + (keywords.length > 0 ? `\nA good answer mentions: ${keywords.join(', ')}.` : '')
    return {
      exerciseType: 'essay',
      exerciseConfig: {
        evaluation_criteria: criteria,
        expected_keywords: keywords,
        passing_score: 70,
        generated_by: 'lesson-question-generator',
      },
    }
  }

  if (item.kind === 'fill_in_the_blank') {
    const accepted = (item.accepted_answers ?? [])
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    if (accepted.length === 0) {
      throw new Error(`"${item.title}" needs at least one accepted answer`)
    }
    return {
      exerciseType: 'fill_in_the_blank',
      exerciseConfig: {
        questions: [
          {
            id: randomUUID(),
            type: 'fill_in_the_blank',
            prompt: item.prompt,
            acceptedAnswers: accepted,
            explanation: explanation || rubric,
          },
        ],
        passing_score: 70,
        generated_by: 'lesson-question-generator',
      },
    }
  }

  // multiple_choice
  const options = (item.options ?? []).map((o) => o.trim()).filter(Boolean)
  if (options.length < 2 || item.correct_index < 0 || item.correct_index >= options.length) {
    throw new Error(`"${item.title}" needs 2+ options and a valid correct option`)
  }
  return {
    exerciseType: 'multiple_choice',
    exerciseConfig: {
      questions: [
        {
          id: randomUUID(),
          type: 'multiple_choice',
          prompt: item.prompt,
          options,
          correctIndex: item.correct_index,
          explanation: explanation || rubric,
        },
      ],
      passing_score: 70,
      generated_by: 'lesson-question-generator',
    },
  }
}
