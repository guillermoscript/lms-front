'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'

/**
 * Approves a course (moves from draft to published)
 */
export async function approveCourse(courseId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!courseId) {
      throw new Error('Course ID is required')
    }

    const adminClient = createAdminClient()

    // Update course status
    const { data: course, error } = await adminClient
      .from('courses')
      .update({
        status: 'published',
        published_at: new Date().toISOString()
      })
      .eq('course_id', courseId)
      .select('title, author_id')
      .single()

    if (error) throw error

    // Notify teacher
    if (course) {
      await adminClient.from('notifications').insert({
        user_id: course.author_id,
        notification_type: 'course_update',
        message: `Your course "${course.title}" has been approved and published!`,
        link: `/dashboard/teacher/courses/${courseId}`
      })
    }

    revalidatePath('/dashboard/admin/courses')
    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath('/dashboard/student')

    return { success: true }
  } catch (error) {
    console.error('Approve course failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve course'
    }
  }
}

/**
 * Archives a course (moves to archived status)
 */
export async function archiveCourse(
  courseId: number,
  reason?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!courseId) {
      throw new Error('Course ID is required')
    }

    const adminClient = createAdminClient()

    // Update course status
    const { data: course, error } = await adminClient
      .from('courses')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString()
      })
      .eq('course_id', courseId)
      .select('title, author_id')
      .single()

    if (error) throw error

    // Notify teacher
    if (course) {
      const message = reason
        ? `Your course "${course.title}" has been archived. Reason: ${reason}`
        : `Your course "${course.title}" has been archived.`

      await adminClient.from('notifications').insert({
        user_id: course.author_id,
        notification_type: 'course_update',
        message,
        link: `/dashboard/teacher/courses/${courseId}`
      })
    }

    revalidatePath('/dashboard/admin/courses')
    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath('/dashboard/student')

    return { success: true }
  } catch (error) {
    console.error('Archive course failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive course'
    }
  }
}

/**
 * Restores an archived course to published status
 */
export async function restoreCourse(courseId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!courseId) {
      throw new Error('Course ID is required')
    }

    const adminClient = createAdminClient()

    // Update course status
    const { data: course, error } = await adminClient
      .from('courses')
      .update({
        status: 'published',
        archived_at: null
      })
      .eq('course_id', courseId)
      .select('title, author_id')
      .single()

    if (error) throw error

    // Notify teacher
    if (course) {
      await adminClient.from('notifications').insert({
        user_id: course.author_id,
        notification_type: 'course_update',
        message: `Your course "${course.title}" has been restored and is now published.`,
        link: `/dashboard/teacher/courses/${courseId}`
      })
    }

    revalidatePath('/dashboard/admin/courses')
    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath('/dashboard/student')

    return { success: true }
  } catch (error) {
    console.error('Restore course failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore course'
    }
  }
}
