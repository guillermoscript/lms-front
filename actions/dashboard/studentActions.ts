'use server'

import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export async function studentSubmitLessonComment (state: {
    comment: string
    lesson_id: number
    parent_comment_id?: number
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
    }

    const studentId = userData.data.user?.id

    const commentInsert = await supabase.from('lesson_comments').insert({
        user_id: studentId,
        lesson_id: state.lesson_id,
        content: state.comment,
        parent_comment_id: state.parent_comment_id,
        created_at: new Date().toISOString()
    })

    if (commentInsert.error) {
        return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
    return createResponse('success', 'Lesson updated successfully', null, null)
}
