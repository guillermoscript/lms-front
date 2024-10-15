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

// function for edit a message from an exercise
export async function editExerciseMessageAction(data: { exerciseId: string, messageId: string, message: string }) {
    const exerciseId = data.exerciseId
    const messageId = data.messageId
    const message = data.message

    if (!exerciseId || !messageId || !message) {
        return createResponse('error', 'Exercise id, message id and message are required', null, 'Exercise id, message id and message are required')
    }

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        console.log(userData.error)
        return createResponse('error', 'Error fetching user', null, 'Error fetching user')
    }

    // check if the messageId is a number or a string with a number
    const messageData = /^\d+$/.test(messageId) ? await supabase
        .from('exercise_messages')
        .update({ message })
        .eq('exercise_id', exerciseId)
        .eq('id', messageId)
        .eq('user_id', userData.data.user.id)
        : await supabase
            .from('exercise_messages')
            .update({ message })
            .eq('exercise_id', exerciseId)
            .eq('message', message)
            .eq('user_id', userData.data.user.id)


    if (messageData.error) {
        console.log(messageData.error)
        return createResponse('error', 'Error updating message', null, 'Error updating message')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/exercises/[exerciseId]')
    return createResponse('success', 'Message updated successfully', null, null)
}

// function for delete a message from an exercise
export async function deleteExerciseMessageAction(data: { exerciseId: string, messageId: string; messageContent: string }) {
    const exerciseId = data.exerciseId
    const messageId = data.messageId

    if (!exerciseId || !messageId) {
        return createResponse('error', 'Exercise id and message id are required', null, 'Exercise id and message id are required')
    }

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        console.log(userData.error)
        return createResponse('error', 'Error fetching user', null, 'Error fetching user')
    }

    const messageData = /^\d+$/.test(messageId) ? await supabase
        .from('exercise_messages')
        .delete()
        .eq('exercise_id', exerciseId)
        .eq('id', messageId)
        .eq('user_id', userData.data.user.id)
        : await supabase
            .from('exercise_messages')
            .delete()
            .eq('exercise_id', exerciseId)
            .eq('message', data.messageContent)
            .eq('user_id', userData.data.user.id)

    if (messageData.error) {
        console.log(messageData.error)
        return createResponse('error', 'Error deleting message', null, 'Error deleting message')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/exercises/[exerciseId]')
    return createResponse('success', 'Message deleted successfully', null, null)
}