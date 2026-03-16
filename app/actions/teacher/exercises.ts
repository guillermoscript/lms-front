'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { revalidatePath } from 'next/cache'

export interface ExerciseFormData {
  title: string
  description: string
  instructions: string
  exercise_type: string
  difficulty_level: string
  time_limit: number
  system_prompt: string
  status: string
  publish: boolean
  lesson_id?: number | null
  // Audio/video config fields
  topic_prompt: string
  min_duration_seconds: number
  max_duration_seconds: number
  passing_score: number
  max_daily_attempts: number
  rubric_filler_words: boolean
  rubric_pace: boolean
  rubric_structure: boolean
  rubric_confidence: boolean
}

function buildAudioConfig(data: ExerciseFormData) {
  return {
    stt_provider: 'assemblyai',
    ai_coach: 'openai',
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
  }
}

export async function createExercise(courseId: number, data: ExerciseFormData) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    if (!data.title?.trim()) throw new Error('Title is required')

    const isAudioType = data.exercise_type === 'audio_evaluation' || data.exercise_type === 'video_evaluation'

    const exerciseData: Record<string, unknown> = {
      course_id: courseId,
      tenant_id: ctx.tenantId,
      lesson_id: data.lesson_id || null,
      title: data.title.trim(),
      description: data.description || null,
      instructions: data.instructions || '',
      exercise_type: data.exercise_type,
      difficulty_level: data.difficulty_level,
      time_limit: data.time_limit,
      system_prompt: data.system_prompt || null,
      status: data.publish ? 'published' : data.status,
      created_by: ctx.userId,
    }

    if (isAudioType) {
      exerciseData.exercise_config = buildAudioConfig(data)
    }

    const { data: newExercise, error } = await ctx.supabase
      .from('exercises')
      .insert(exerciseData)
      .select('id')
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${courseId}/exercises`)

    return { exerciseId: newExercise.id }
  })
}

export async function updateExercise(
  courseId: number,
  exerciseId: number,
  data: ExerciseFormData
) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    if (!data.title?.trim()) throw new Error('Title is required')

    const isAudioType = data.exercise_type === 'audio_evaluation' || data.exercise_type === 'video_evaluation'

    const exerciseData: Record<string, unknown> = {
      lesson_id: data.lesson_id || null,
      title: data.title.trim(),
      description: data.description || null,
      instructions: data.instructions || '',
      exercise_type: data.exercise_type,
      difficulty_level: data.difficulty_level,
      time_limit: data.time_limit,
      system_prompt: data.system_prompt || null,
      status: data.publish ? 'published' : data.status,
    }

    if (isAudioType) {
      exerciseData.exercise_config = buildAudioConfig(data)
    }

    const { error } = await ctx.supabase
      .from('exercises')
      .update(exerciseData)
      .eq('id', exerciseId)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${courseId}/exercises`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/exercises/${exerciseId}`)

    return { exerciseId }
  })
}
