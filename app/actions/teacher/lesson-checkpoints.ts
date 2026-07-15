'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership, type AuthContext } from '@/lib/actions/utils'
import { revalidatePath } from 'next/cache'
import type { CheckpointPlacement } from '@/lib/checkpoints/types'

export interface LessonCheckpointInput {
  lessonId: number
  exerciseId: number
  placementType: CheckpointPlacement
  contentBlockId?: string | null
  videoTimestampSeconds?: number | null
  label?: string | null
  allowSkip?: boolean
  maxAiAttempts?: number
  isRequired?: boolean
  isEnabled?: boolean
}

export interface LessonCheckpointPatch {
  exerciseId?: number
  placementType?: CheckpointPlacement
  contentBlockId?: string | null
  videoTimestampSeconds?: number | null
  label?: string | null
  allowSkip?: boolean
  maxAiAttempts?: number
  isRequired?: boolean
  isEnabled?: boolean
}

export interface TeacherLessonCheckpoint {
  id: number
  lesson_id: number
  exercise_id: number
  placement_type: CheckpointPlacement
  content_block_id: string | null
  video_timestamp_seconds: number | null
  label: string | null
  allow_skip: boolean
  max_ai_attempts: number
  is_required: boolean
  is_enabled: boolean
  exercise: { id: number; title: string; exercise_type: string } | null
}

export interface CheckpointExerciseOption {
  id: number
  title: string
  exercise_type: string
}

export interface CheckpointMetric {
  checkpointId: number
  attemptCount: number
  distinctStudents: number
  avgScore: number | null
  passRate: number | null
}

/** Verify a lesson belongs to the current tenant and the caller owns its course. Returns the lesson row. */
async function verifyLessonOwnership(
  ctx: AuthContext,
  lessonId: number
): Promise<{ id: number; course_id: number }> {
  const { data: lesson } = await ctx.supabase
    .from('lessons')
    .select('id, course_id')
    .eq('id', lessonId)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!lesson) throw new Error('Lesson not found')

  await verifyCourseOwnership(ctx, lesson.course_id)

  return lesson
}

function validatePlacement(input: {
  placementType: CheckpointPlacement
  contentBlockId?: string | null
  videoTimestampSeconds?: number | null
}) {
  if (input.placementType === 'inline') {
    if (!input.contentBlockId) {
      throw new Error('content_block_id is required for inline checkpoints')
    }
  } else if (input.placementType === 'video') {
    if (
      input.videoTimestampSeconds === null ||
      input.videoTimestampSeconds === undefined ||
      input.videoTimestampSeconds < 0
    ) {
      throw new Error('video_timestamp_seconds must be >= 0 for video checkpoints')
    }
  } else {
    throw new Error('Invalid placement_type')
  }
}

async function verifyExerciseInCourse(
  ctx: AuthContext,
  exerciseId: number,
  courseId: number
): Promise<void> {
  const { data: exercise } = await ctx.supabase
    .from('exercises')
    .select('id, course_id, tenant_id')
    .eq('id', exerciseId)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!exercise || exercise.tenant_id !== ctx.tenantId || exercise.course_id !== courseId) {
    throw new Error('Exercise not found in this course')
  }
}

export async function listLessonCheckpoints(lessonId: number) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyLessonOwnership(ctx, lessonId)

    const { data, error } = await ctx.supabase
      .from('lesson_checkpoints')
      .select(
        'id, lesson_id, exercise_id, placement_type, content_block_id, video_timestamp_seconds, label, allow_skip, max_ai_attempts, is_required, is_enabled, exercises(id, title, exercise_type)'
      )
      .eq('lesson_id', lessonId)
      .eq('tenant_id', ctx.tenantId)
      .order('id', { ascending: true })

    if (error) throw error

    const checkpoints: TeacherLessonCheckpoint[] = (data || []).map((row) => {
      const exercise = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises
      return {
        id: row.id,
        lesson_id: row.lesson_id,
        exercise_id: row.exercise_id,
        placement_type: row.placement_type as CheckpointPlacement,
        content_block_id: row.content_block_id,
        video_timestamp_seconds: row.video_timestamp_seconds,
        label: row.label,
        allow_skip: row.allow_skip,
        max_ai_attempts: row.max_ai_attempts,
        is_required: row.is_required,
        is_enabled: row.is_enabled,
        exercise: exercise ? { id: exercise.id, title: exercise.title, exercise_type: exercise.exercise_type } : null,
      }
    })

    return { checkpoints }
  })
}

export async function createLessonCheckpoint(input: LessonCheckpointInput) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    const lesson = await verifyLessonOwnership(ctx, input.lessonId)

    validatePlacement(input)
    await verifyExerciseInCourse(ctx, input.exerciseId, lesson.course_id)

    const { data: newCheckpoint, error } = await ctx.supabase
      .from('lesson_checkpoints')
      .insert({
        tenant_id: ctx.tenantId,
        lesson_id: input.lessonId,
        exercise_id: input.exerciseId,
        placement_type: input.placementType,
        content_block_id: input.placementType === 'inline' ? input.contentBlockId : null,
        video_timestamp_seconds: input.placementType === 'video' ? input.videoTimestampSeconds : null,
        label: input.label || null,
        allow_skip: input.allowSkip ?? false,
        max_ai_attempts: input.maxAiAttempts ?? 1,
        is_required: input.isRequired ?? true,
        is_enabled: input.isEnabled ?? true,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${lesson.course_id}/lessons/${input.lessonId}`)

    return { checkpointId: newCheckpoint.id }
  })
}

export async function updateLessonCheckpoint(id: number, patch: LessonCheckpointPatch) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()

    const { data: existing } = await ctx.supabase
      .from('lesson_checkpoints')
      .select('id, lesson_id, exercise_id, placement_type, content_block_id, video_timestamp_seconds')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (!existing) throw new Error('Checkpoint not found')

    const lesson = await verifyLessonOwnership(ctx, existing.lesson_id)

    const merged = {
      placementType: patch.placementType ?? (existing.placement_type as CheckpointPlacement),
      contentBlockId: patch.contentBlockId !== undefined ? patch.contentBlockId : existing.content_block_id,
      videoTimestampSeconds:
        patch.videoTimestampSeconds !== undefined
          ? patch.videoTimestampSeconds
          : existing.video_timestamp_seconds,
    }
    validatePlacement(merged)

    const exerciseId = patch.exerciseId ?? existing.exercise_id
    if (patch.exerciseId !== undefined) {
      await verifyExerciseInCourse(ctx, patch.exerciseId, lesson.course_id)
    }

    const updateData: Record<string, unknown> = { exercise_id: exerciseId, placement_type: merged.placementType }
    updateData.content_block_id = merged.placementType === 'inline' ? merged.contentBlockId : null
    updateData.video_timestamp_seconds = merged.placementType === 'video' ? merged.videoTimestampSeconds : null
    if (patch.label !== undefined) updateData.label = patch.label || null
    if (patch.allowSkip !== undefined) updateData.allow_skip = patch.allowSkip
    if (patch.maxAiAttempts !== undefined) updateData.max_ai_attempts = patch.maxAiAttempts
    if (patch.isRequired !== undefined) updateData.is_required = patch.isRequired
    if (patch.isEnabled !== undefined) updateData.is_enabled = patch.isEnabled

    const { error } = await ctx.supabase
      .from('lesson_checkpoints')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${lesson.course_id}/lessons/${existing.lesson_id}`)

    return { checkpointId: id }
  })
}

export async function deleteLessonCheckpoint(id: number) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()

    const { data: existing } = await ctx.supabase
      .from('lesson_checkpoints')
      .select('id, lesson_id')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (!existing) throw new Error('Checkpoint not found')

    const lesson = await verifyLessonOwnership(ctx, existing.lesson_id)

    const { error } = await ctx.supabase
      .from('lesson_checkpoints')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${lesson.course_id}/lessons/${existing.lesson_id}`)

    return { checkpointId: id }
  })
}

export async function listCheckpointExercises(courseId: number) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    const { data, error } = await ctx.supabase
      .from('exercises')
      .select('id, title, exercise_type')
      .eq('course_id', courseId)
      .eq('tenant_id', ctx.tenantId)
      .order('title', { ascending: true })

    if (error) throw error

    const exercises: CheckpointExerciseOption[] = (data || []).map((e) => ({
      id: e.id,
      title: e.title,
      exercise_type: e.exercise_type,
    }))

    return { exercises }
  })
}

export async function getLessonCheckpointMetrics(lessonId: number) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyLessonOwnership(ctx, lessonId)

    const { data: checkpoints, error: checkpointsError } = await ctx.supabase
      .from('lesson_checkpoints')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('tenant_id', ctx.tenantId)

    if (checkpointsError) throw checkpointsError

    const checkpointIds = (checkpoints || []).map((c) => c.id)
    if (checkpointIds.length === 0) {
      return { metrics: [] as CheckpointMetric[] }
    }

    const { data: attempts, error: attemptsError } = await ctx.supabase
      .from('lesson_checkpoint_attempts')
      .select('checkpoint_id, user_id, score, passed')
      .eq('tenant_id', ctx.tenantId)
      .in('checkpoint_id', checkpointIds)

    if (attemptsError) throw attemptsError

    const byCheckpoint = new Map<
      number,
      { attemptCount: number; students: Set<string>; scoreSum: number; scoreCount: number; passCount: number; passTotal: number }
    >()

    for (const id of checkpointIds) {
      byCheckpoint.set(id, { attemptCount: 0, students: new Set(), scoreSum: 0, scoreCount: 0, passCount: 0, passTotal: 0 })
    }

    for (const attempt of attempts || []) {
      const bucket = byCheckpoint.get(attempt.checkpoint_id)
      if (!bucket) continue
      bucket.attemptCount += 1
      bucket.students.add(attempt.user_id)
      if (typeof attempt.score === 'number') {
        bucket.scoreSum += attempt.score
        bucket.scoreCount += 1
      }
      if (attempt.passed !== null && attempt.passed !== undefined) {
        bucket.passTotal += 1
        if (attempt.passed) bucket.passCount += 1
      }
    }

    const metrics: CheckpointMetric[] = checkpointIds.map((id) => {
      const bucket = byCheckpoint.get(id)!
      return {
        checkpointId: id,
        attemptCount: bucket.attemptCount,
        distinctStudents: bucket.students.size,
        avgScore: bucket.scoreCount > 0 ? Math.round((bucket.scoreSum / bucket.scoreCount) * 100) / 100 : null,
        passRate: bucket.passTotal > 0 ? Math.round((bucket.passCount / bucket.passTotal) * 10000) / 100 : null,
      }
    })

    return { metrics }
  })
}
