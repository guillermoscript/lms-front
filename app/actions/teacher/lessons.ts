'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
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
      })
      .select('id')
      .single()

    if (error) throw error

    if (data.ai_task_description || data.ai_task_instructions) {
      const { error: taskError } = await ctx.supabase
        .from('lessons_ai_tasks')
        .upsert(
          {
            lesson_id: newLesson.id,
            task_instructions: data.ai_task_description || '',
            system_prompt: data.ai_task_instructions || '',
          },
          { onConflict: 'lesson_id' }
        )
      if (taskError) throw taskError
    }

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
      })
      .eq('id', lessonId)
      .eq('tenant_id', ctx.tenantId)

    if (error) throw error

    if (data.ai_task_description || data.ai_task_instructions) {
      const { error: taskError } = await ctx.supabase
        .from('lessons_ai_tasks')
        .upsert(
          {
            lesson_id: lessonId,
            task_instructions: data.ai_task_description || '',
            system_prompt: data.ai_task_instructions || '',
          },
          { onConflict: 'lesson_id' }
        )
      if (taskError) throw taskError
    }

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)

    return { lessonId }
  })
}
