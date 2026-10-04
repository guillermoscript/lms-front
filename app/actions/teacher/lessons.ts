'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { structuredRequirementsSchema, type StructuredRequirements } from '@/lib/ai/lesson-requirements'
import { revalidatePath } from 'next/cache'

export interface LessonFormData {
  title: string
  description: string
  content: string
  video_url: string
  sequence: number
  publish: boolean
  publish_at: string
  ai_task_description: string
  ai_task_instructions: string
  /** Structured form (#806). `null`/`undefined` keeps the free-text task above. */
  ai_task_requirements?: StructuredRequirements | null
  is_preview: boolean
}

export async function createLesson(courseId: number, data: LessonFormData) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    if (!data.title?.trim()) throw new Error('Title is required')

    const isScheduled = !data.publish && data.publish_at
    const { data: newLesson, error } = await ctx.supabase
      .from('lessons')
      .insert({
        course_id: courseId,
        tenant_id: ctx.tenantId,
        title: data.title.trim(),
        description: data.description || null,
        content: data.content || null,
        video_url: data.video_url || null,
        sequence: data.sequence,
        status: data.publish ? ('published' as const) : ('draft' as const),
        publish_at: isScheduled ? data.publish_at : null,
        is_preview: data.is_preview ?? false,
      })
      .select('id')
      .single()

    if (error) throw error

    if (data.ai_task_description?.trim() || data.ai_task_instructions?.trim() || data.ai_task_requirements) {
      // The structured form takes over the whole prompt (#806): validated
      // server-side too, since a bad shape here would 500 the student's chat.
      const requirements = data.ai_task_requirements
        ? structuredRequirementsSchema.parse(data.ai_task_requirements)
        : null
      const { error: taskError } = await ctx.supabase
        .from('lessons_ai_tasks')
        .upsert(
          {
            lesson_id: newLesson.id,
            task_instructions: data.ai_task_description || '',
            system_prompt: data.ai_task_instructions || '',
            requirements,
          },
          { onConflict: 'lesson_id' }
        )
      if (taskError) throw taskError
    }

    // `block_count` from the doc lives in the BlockEditor (client); what the
    // server can measure is the size of what was actually persisted.
    await track(
      ANALYTICS_EVENTS.LESSON_CREATED,
      {
        lesson_id: newLesson.id,
        course_id: courseId,
        content_length: (data.content || '').length,
        has_video: Boolean(data.video_url),
        has_ai_task: Boolean(
          data.ai_task_description?.trim() || data.ai_task_instructions?.trim() || data.ai_task_requirements
        ),
        is_preview: data.is_preview ?? false,
        published: Boolean(data.publish),
      },
      { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role }
    )

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)

    return { lessonId: newLesson.id }
  })
}

export async function updateLesson(
  courseId: number,
  lessonId: number,
  data: LessonFormData
) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    if (!data.title?.trim()) throw new Error('Title is required')

    const isScheduled = !data.publish && data.publish_at
    const { error } = await ctx.supabase
      .from('lessons')
      .update({
        title: data.title.trim(),
        description: data.description || null,
        content: data.content || null,
        video_url: data.video_url || null,
        sequence: data.sequence,
        status: data.publish ? ('published' as const) : ('draft' as const),
        publish_at: isScheduled ? data.publish_at : null,
        is_preview: data.is_preview ?? false,
      })
      .eq('id', lessonId)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    if (data.ai_task_description?.trim() || data.ai_task_instructions?.trim() || data.ai_task_requirements) {
      // The structured form takes over the whole prompt (#806): validated
      // server-side too, since a bad shape here would 500 the student's chat.
      const requirements = data.ai_task_requirements
        ? structuredRequirementsSchema.parse(data.ai_task_requirements)
        : null
      const { error: taskError } = await ctx.supabase
        .from('lessons_ai_tasks')
        .upsert(
          {
            lesson_id: lessonId,
            task_instructions: data.ai_task_description || '',
            system_prompt: data.ai_task_instructions || '',
            requirements,
          },
          { onConflict: 'lesson_id' }
        )
      if (taskError) throw taskError
    } else {
      // Both fields cleared means the teacher removed the task. Without this the
      // old task stays live for students while the editor shows it as gone.
      const { error: taskError } = await ctx.supabase
        .from('lessons_ai_tasks')
        .delete()
        .eq('lesson_id', lessonId)
      if (taskError) throw taskError
    }

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)

    return { lessonId }
  })
}

/**
 * Flip one lesson's free-preview flag from the course's lesson list (#791).
 *
 * The switch used to live only inside the lesson editor's Details step, so
 * making three lessons free meant opening and saving three editors — which is
 * a large part of why `is_preview` was set on 1 lesson in 83. This is the same
 * write, reachable from the list.
 */
export async function setLessonPreview(
  courseId: number,
  lessonId: number,
  isPreview: boolean
) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    const { error } = await ctx.supabase
      .from('lessons')
      .update({ is_preview: isPreview })
      .eq('id', lessonId)
      .eq('course_id', courseId)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)
    // The public course page lists which lessons a visitor can open, so it is
    // stale the moment this flips.
    revalidatePath(`/courses/${courseId}`)

    return { lessonId, isPreview }
  })
}
