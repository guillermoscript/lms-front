'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeacherOrAdmin, verifyCourseOwnership, type ActionResult } from '@/lib/actions/utils'
import { gradeErrorKey, normalizeGradeFeedback, parseGradeScore } from '@/lib/community/prompt-grades'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SavedPromptGrade {
  studentId: string
  score: number
  feedback: string | null
  graded_at: string
}

const GRADE_COLUMNS = 'student_id, score, feedback, graded_at'

function refusal(error: { code?: string; message?: string }): string | null {
  const key = gradeErrorKey(error)
  if (key === 'notAllowed') return 'Only the school’s teachers and admins can grade this prompt'
  if (key === 'invalid') return 'This prompt or student can no longer be graded'
  return null
}

/**
 * Grade one student on one graded discussion prompt (#873), or change the
 * grade. The course's author or an admin, like the course community page.
 *
 * Writes through the teacher's own RLS client: the database is the authority
 * (community_guard_prompt_grade + the "Staff grade prompts" policies), stamps
 * the grader and the time, and fires the XP and the student's notification.
 * The checks here give the friendly error first.
 */
export async function savePromptGrade(input: {
  courseId: number
  postId: string
  studentId: string
  score: number | string
  feedback?: string | null
}): Promise<ActionResult<SavedPromptGrade>> {
  try {
    const ctx = await requireTeacherOrAdmin()

    if (!Number.isInteger(input.courseId) || input.courseId <= 0) return { success: false, error: 'Invalid course' }
    if (!UUID.test(input.postId) || !UUID.test(input.studentId)) return { success: false, error: 'Invalid request' }

    const score = parseGradeScore(input.score)
    if (score === null) return { success: false, error: 'The score must be a whole number from 0 to 100' }
    const feedback = normalizeGradeFeedback(input.feedback)
    if (feedback === 'invalid') return { success: false, error: 'Feedback is too long' }

    await verifyCourseOwnership(ctx, input.courseId)

    // Service role for the lookup only: the posts SELECT policy follows the
    // JWT's school, which can lag the subdomain's. The write below is RLS.
    const { data: post } = await createAdminClient()
      .from('community_posts')
      .select('id')
      .eq('id', input.postId)
      .eq('tenant_id', ctx.tenantId)
      .eq('course_id', input.courseId)
      .eq('post_type', 'discussion_prompt')
      .eq('is_graded', true)
      .eq('is_hidden', false)
      .maybeSingle()
    if (!post) return { success: false, error: 'This prompt is not graded or no longer exists' }

    // Update first; a first grade inserts. A teacher grading the same student
    // at the same moment loses the insert race (23505) and updates instead.
    let saved: { student_id: string; score: number; feedback: string | null; graded_at: string } | null = null
    for (let attempt = 0; attempt < 2 && !saved; attempt++) {
      const { data: updated, error: updateError } = await ctx.supabase
        .from('community_prompt_grades')
        .update({ score, feedback })
        .eq('tenant_id', ctx.tenantId)
        .eq('post_id', input.postId)
        .eq('student_id', input.studentId)
        .select(GRADE_COLUMNS)
        .maybeSingle()
      if (updateError) {
        const message = refusal(updateError)
        if (message) return { success: false, error: message }
        throw updateError
      }
      if (updated) {
        saved = updated
        break
      }

      const { data: inserted, error: insertError } = await ctx.supabase
        .from('community_prompt_grades')
        .insert({
          tenant_id: ctx.tenantId,
          post_id: input.postId,
          student_id: input.studentId,
          score,
          feedback,
          graded_by: ctx.userId,
        })
        .select(GRADE_COLUMNS)
        .single()
      if (insertError) {
        if (insertError.code === '23505') continue
        const message = refusal(insertError)
        if (message) return { success: false, error: message }
        throw insertError
      }
      saved = inserted
    }

    if (!saved) return { success: false, error: 'Failed to save the grade' }

    revalidatePath(`/dashboard/teacher/courses/${input.courseId}/community`)
    revalidatePath(`/dashboard/student/courses/${input.courseId}`)
    revalidatePath('/dashboard/student/progress')

    return {
      success: true,
      data: { studentId: saved.student_id, score: saved.score, feedback: saved.feedback, graded_at: saved.graded_at },
    }
  } catch (err) {
    console.error('Failed to save a prompt grade:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save the grade' }
  }
}

/**
 * Take a grade back (#873): the student is ungraded again and their "you were
 * graded" notification is withdrawn (the database does that). XP stays.
 */
export async function removePromptGrade(input: {
  courseId: number
  postId: string
  studentId: string
}): Promise<ActionResult> {
  try {
    const ctx = await requireTeacherOrAdmin()
    if (!Number.isInteger(input.courseId) || input.courseId <= 0) return { success: false, error: 'Invalid course' }
    if (!UUID.test(input.postId) || !UUID.test(input.studentId)) return { success: false, error: 'Invalid request' }

    await verifyCourseOwnership(ctx, input.courseId)

    // Service role for the lookup only: the posts SELECT policy follows the
    // JWT's school, which can lag the subdomain's. The write below is RLS.
    const { data: post } = await createAdminClient()
      .from('community_posts')
      .select('id')
      .eq('id', input.postId)
      .eq('tenant_id', ctx.tenantId)
      .eq('course_id', input.courseId)
      .maybeSingle()
    if (!post) return { success: false, error: 'This prompt no longer exists' }

    const { error } = await ctx.supabase
      .from('community_prompt_grades')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('post_id', input.postId)
      .eq('student_id', input.studentId)
    if (error) {
      const message = refusal(error)
      if (message) return { success: false, error: message }
      throw error
    }

    revalidatePath(`/dashboard/teacher/courses/${input.courseId}/community`)
    revalidatePath('/dashboard/student/progress')
    return { success: true }
  } catch (err) {
    console.error('Failed to remove a prompt grade:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove the grade' }
  }
}
