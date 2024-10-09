'use server'
import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export async function deleteExerciseAction(data: { exerciseId: string }) {
    const exerciseId = data.exerciseId

    if (!exerciseId) {
        return createResponse('error', 'Exercise id is required', null, 'Exercise id is required')
    }

    const supabase = createClient()
    const exerciseData = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId)

    if (exerciseData.error) {
        console.log(exerciseData.error)
        return createResponse('error', 'Error deleting exercise', null, 'Error deleting exercise')
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout')
    return createResponse('success', 'Exercise deleted successfully', null, null)
}

export async function deleteMessagesAndCompletitionOfExerciseAction(data: { exerciseId: string }) {
    const exerciseId = data.exerciseId

    if (!exerciseId) {
        return createResponse('error', 'Exercise id is required', null, 'Exercise id is required')
    }

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        console.log(userData.error)
        return createResponse('error', 'Error fetching user', null, 'Error fetching user')
    }


    const completionsData = await supabase
        .from('exercise_completions')
        .delete()
        .eq('exercise_id', exerciseId)
        .eq('user_id', userData.data.user.id)

    if (completionsData.error) {
        console.log(completionsData.error)
        return createResponse('error', 'Error deleting completions', null, 'Error deleting completions')
    }

    const messagesData = await supabase
        .from('exercise_messages')
        .delete()
        .eq('exercise_id', exerciseId)
        .eq('user_id', userData.data.user.id)

    if (messagesData.error) {
        console.log(messagesData.error)
        return createResponse('error', 'Error deleting messages', null, 'Error deleting messages')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/exercises/[exerciseId]', 'page')
    return createResponse('success', 'Exercise deleted successfully', null, null)
}