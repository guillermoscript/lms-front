'use server'
import { openai } from '@ai-sdk/openai'
import { convertToCoreMessages, generateText, Message } from 'ai'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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

export async function actionButtonsAction(data: { exerciseId: string, messages: Message[] }) {
    const { messages, exerciseId } = data

    if (!exerciseId || !messages) {
        return createResponse('error', 'Exercise id and action are required', null, 'Exercise id and action are required')
    }

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        console.log(userData.error)
        return createResponse('error', 'Error fetching user', null, 'Error fetching user')
    }

    let isApproved = false

    const result = await generateText({
        // model: google('gemini-1.5-pro-latest'),
        model: openai('gpt-4o-mini-2024-07-18'),
        messages: convertToCoreMessages(messages),
        temperature: 0.3,
        system: 'Evaluate the student last message. If the student answer is correct, mark the exercise as completed. If the student answer is incorrect, mark the exercise as not completed.',
        tools: {
            makeUserAssigmentCompleted: {
                description: 'Function to mark the exercise as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the exercise. Respond using the language of the student.',
                parameters: z.object({
                    feedback: z.string().describe('Feedback for the student. Tell them what they did right and what they can improve, if needed.'),
                }),
                execute: async ({ feedback }) => {
                    console.log('feedback', feedback)
                    const save = await supabase.from('exercise_completions').insert(
                        {
                            exercise_id: +exerciseId,
                            user_id: userData.data.user.id,
                            completed_by: userData.data.user.id,
                        }
                    )

                    const saveText = await supabase.from('exercise_messages').insert(
                        {
                            exercise_id: +exerciseId,
                            user_id: userData.data.user.id,
                            role: 'assistant',
                            message: feedback,
                        }
                    )

                    isApproved = true

                    return feedback
                }
            },
            userAssigmentIsNotCompleted: {
                description: 'Function to mark the exercise as not completed, you must only call it when the student code is incorrect or not working properly. Respond using the language of the student.',
                parameters: z.object({
                    feedback: z.string().describe('Feedback for the student. Tell them what they did wrong and how they can improve.'),
                }),
                execute: async ({ feedback }) => {
                    // const saveText = await supabase.from('exercise_messages').insert(
                    //     {
                    //         exercise_id: +exerciseId,
                    //         user_id: userData.data.user.id,
                    //         role: 'assistant',
                    //         message: feedback,
                    //     }
                    // )
                    console.log('feedback2', feedback)
                    return feedback
                }
            },
        },
        toolChoice: 'required',
    })

    console.log('text', result)

    return createResponse('success', 'Action buttons clicked successfully', {
        // result: result.responseMessages,
        isApproved,
        toolResult: result.toolResults[0].result,
    }, null)
}

export async function markExerciseCompletedAction(data: { exerciseId: number }) {
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

    // Check if completion already exists
    const { data: existingCompletion, error: existingCompletionError } = await supabase
        .from('exercise_completions')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('user_id', userData.data.user.id)
        .single()

    if (existingCompletionError && existingCompletionError.code !== 'PGRST116') {
        console.log(existingCompletionError)
        return createResponse('error', 'Error checking existing completion', null, 'Error checking existing completion')
    }

    if (existingCompletion) {
        return createResponse('error', 'Exercise already marked as completed', null, 'Exercise already marked as completed')
    }

    const completionData = await supabase
        .from('exercise_completions')
        .insert({
            exercise_id: exerciseId,
            user_id: userData.data.user.id,
            completed_by: userData.data.user.id,
        })

    if (completionData.error) {
        console.log(completionData.error)
        return createResponse('error', 'Error marking exercise as completed', null, 'Error marking exercise as completed')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/exercises/[exerciseId]')
    return createResponse('success', 'Exercise marked as completed successfully', null, null)
}

export async function saveUserSubmissionAction(data: { exerciseId: number, submissionCode: string }) {
    const { exerciseId, submissionCode } = data

    if (!exerciseId || !submissionCode) {
        return createResponse('error', 'Exercise id and submission code are required', null, 'Exercise id and submission code are required')
    }

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        console.log(userData.error)
        return createResponse('error', 'Error fetching user', null, 'Error fetching user')
    }

    const { data: submissionData, error } = await supabase
        .from('exercise_code_student_submissions')
        .insert([
            {
                exercise_id: exerciseId,
                user_id: userData.data.user.id,
                submission_code: submissionCode,
            },
        ])

    if (error) {
        console.log(error)
        return createResponse('error', 'Error saving submission', null, 'Error saving submission')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/exercises/[exerciseId]')
    return createResponse('success', 'Submission saved successfully', null, null)
}
