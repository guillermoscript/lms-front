
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export async function editLessonsAction (prevDate: any, data: FormData) {
    const lessonId = data.get('lessonId') as string
    const title = data.get('title') as string
    const description = data.get('description') as string
    const sequence = data.get('sequence') as string
    const status = data.get('status') as string
    const video_url = data.get('video_url') as string
    const content = data.get('content') as string
    const embed = data.get('embed') as string
    const system_prompt = data.get('systemPrompt') as string
    const course_id = data.get('course_id') as string
    const image = data.get('image') as string
    const task_instructions = data.get('task_instructions') as string

    const supabase = createClient()

    const user = await supabase.auth.getUser()

    if (!user) {
        return createResponse('error', 'User not found', null, 'User not found')
    }

    const lessonData = await supabase
        .from('lessons')
        .update({
            title,
            content,
            video_url,
            image,
            embed_code: embed,
            description,
            status: status as any,
            sequence: parseFloat(sequence),
            updated_at: new Date().toISOString()
        })
        .eq('id', lessonId)

    if (lessonData.error) {
        return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
    }

    if (system_prompt) {
        const lessonAiAssignmentData = await supabase
            .from('lessons_ai_tasks')
            .update({
                system_prompt,
                task_instructions
            })
            .eq('lesson_id', lessonId)

        if (lessonAiAssignmentData.error) {
            return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
        }
    }

    redirect(`/dashboard/teacher/courses/${course_id}/lessons/${lessonId}`)
}

function validateFields (data: FormData, fields: string[]) {
    for (const field of fields) {
        const value = data.get(field) as string
        if (!value) {
            return createResponse('error', `${field} is required`, null, `${field} is required`)
        }
    }
    return null
}

export async function createLessonsAction (prevDate: any, data: FormData) {
    const title = data.get('title') as string
    const sequence = data.get('sequence') as string
    const status = data.get('status') as string
    const video_url = data.get('video_url') as string
    const course_id = data.get('course_id') as string
    const content = data.get('content') as string
    const embed_code = data.get('embed') as string
    const system_prompt = data.get('systemPrompt') as string
    const description = data.get('description') as string
    const image = data.get('image') as string
    const task_instructions = data.get('task_instructions') as string

    const requiredFields = ['title', 'sequence', 'status', 'course_id', 'content', 'systemPrompt']
    const response = validateFields(data, requiredFields)

    if (response) {
        return response
    }

    const supabase = createClient()

    const user = await supabase.auth.getUser()

    if (!user) {
        return createResponse('error', 'User not found', null, 'User not found')
    }

    const lessonData = await supabase
        .from('lessons')
        .insert({
            // @ts-expect-error: ERR
            title,
            content,
            video_url,
            embed_code,
            status,
            description,
            image,
            sequence,
            course_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).select('id').single()

    if (lessonData.error) {
        return createResponse('error', 'Error creating lesson', null, 'Error creating lesson')
    }

    const lessonAiAssignmentData = await supabase
        .from('lessons_ai_tasks')
        .insert({
            lesson_id: lessonData.data.id,
            system_prompt,
            task_instructions
        })

    redirect(`/dashboard/teacher/courses/${course_id}/lessons/${lessonData.data.id}`)
}

export async function deleteLessonsAction (data: {
    lesonId: string
}) {
    const lessonId = data.lesonId

    if (!lessonId) {
        return createResponse('error', 'Lesson id is required', null, 'Lesson id is required')
    }

    const supabase = createClient()

    const user = await supabase.auth.getUser()

    if (!user) {
        return createResponse('error', 'User not found', null, 'User not found')
    }

    const lessonData = await supabase
        .from('lessons')
        .delete()
        .eq('id', lessonId)

    if (lessonData.error) {
        return createResponse('error', 'Error deleting lesson', null, 'Error deleting lesson')
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout')
    return createResponse('success', 'Lesson deleted successfully', null, null)
}

export async function studentSubmitAiTaskMessage({
    lessonId,
    message
}: {
    lessonId: number
    message: {
        content: string
        role: string
    }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    if (userData.error) {
        console.log('Error getting user data', userData.error)
        return createResponse('error', 'Error getting user data', null, 'Error getting user data')
    }

    const id = userData.data.user.id
    const messageData = await supabase.from('lessons_ai_task_messages').insert({
        user_id: id,
        message: message.content,
        sender: message.role as 'assistant' | 'user',
        lesson_id: lessonId
    }).select('id').single()
    if (messageData.error) {
        console.log('Error adding message to the database', messageData.error)
        return createResponse('error', 'Error adding message to the database', null, 'Error adding message to the database')
    }

    return createResponse('success', 'Message sent successfully', messageData.data.id, null)
}
// here if the message is from a user, then the next message (ai) should be removed and the user message edited from supabase, for this i mus call an action
// if hte message is from the AI then just delete the message and submit user last message to regenerate it, for this also an action
// Helper function to fetch user data
async function getUserData(supabase) {
    const userData = await supabase.auth.getUser()
    if (userData.error) {
        console.log('Error getting user data', userData.error)
        return { error: 'Error getting user data' }
    }
    return { id: userData.data.user.id }
}

// Helper function to update a message
async function updateMessage(supabase, messageId, newMessage) {
    const messageData = await supabase.from('lessons_ai_task_messages').update({ message: newMessage }).eq('id', messageId).select('id').single()
    if (messageData.error) {
        console.log('Error updating message in the database', messageData.error)
        return { error: 'Error updating message in the database' }
    }
    return { id: messageData.data.id }
}

// Helper function to delete messages
async function deleteMessages(supabase, messageIds) {
    const deleteResult = await supabase.from('lessons_ai_task_messages').delete().in('id', messageIds)
    if (deleteResult.error) {
        console.log('Error deleting messages', deleteResult.error)
        return { error: 'Error deleting messages' }
    }
    return { success: true }
}

// Helper function to revalidate path
function revalidatePathAndRespond(path, layout, messageId) {
    revalidatePath(path, layout)
    return createResponse('success', 'Message updated successfully', messageId, null)
}

export async function studentEditAiTaskMessage({
    sender,
    lessonId,
    messageId,
    message,
    newMessage,
    regenerate
}: {
    sender: 'user' | 'assistant',
    lessonId: number,
    messageId?: number,
    message: string,
    newMessage: string,
    regenerate?: boolean
}) {
    const supabase = createClient()
    const userData = await getUserData(supabase)
    if (userData.error) return createResponse('error', userData.error, null, userData.error)

    const userId = userData.id

    if (messageId) {
        const updateResult = await updateMessage(supabase, messageId, newMessage)
        if (updateResult.error) return createResponse('error', updateResult.error, null, updateResult.error)

        if (sender === 'user' && regenerate) {
            const nextMessagesData = await supabase.from('lessons_ai_task_messages').select('id').eq('lesson_id', lessonId).eq('user_id', userId).gt('id', messageId).order('id', { ascending: true })
            if (nextMessagesData.error) return createResponse('error', 'Error getting next message', null, 'Error getting next message')

            if (nextMessagesData.data) {
                const messagesToDelete = nextMessagesData.data.map((msg) => msg.id)
                const deleteResult = await deleteMessages(supabase, messagesToDelete)
                if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

                return revalidatePathAndRespond('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout', updateResult.id)
            }
        }
        return revalidatePathAndRespond('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout', updateResult.id)
    } else {
        const messageData = await supabase.from('lessons_ai_task_messages').select('id, message').eq('lesson_id', lessonId).eq('user_id', userId).order('id', { ascending: true })
        if (messageData.error) return createResponse('error', 'Error getting messages from the database', null, 'Error getting messages from the database')

        const messages = messageData.data
        const messageIndex = messages.findIndex((val) => val.message === message)
        if (messageIndex === -1) return createResponse('error', 'Message not found', null, 'Message not found')

        const messageIdToUpdate = messages[messageIndex].id

        if (sender === 'user' && regenerate) {
            const nextMessagesData = await supabase.from('lessons_ai_task_messages').select('id').eq('lesson_id', lessonId).eq('user_id', userId).gt('id', messageIdToUpdate).order('id', { ascending: true })
            if (nextMessagesData.error) return createResponse('error', 'Error getting next message', null, 'Error getting next message')

            if (nextMessagesData.data) {
                const messagesToDelete = nextMessagesData.data.map((msg) => msg.id)
                const deleteResult = await deleteMessages(supabase, messagesToDelete)
                if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

                const updateResult = await updateMessage(supabase, messageIdToUpdate, newMessage)
                if (updateResult.error) return createResponse('error', updateResult.error, null, updateResult.error)

                return revalidatePathAndRespond('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout', updateResult.id)
            }
        } else {
            const updateResult = await updateMessage(supabase, messageIdToUpdate, newMessage)
            if (updateResult.error) return createResponse('error', updateResult.error, null, updateResult.error)

            return revalidatePathAndRespond('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout', updateResult.id)
        }
    }
}

// Helper function to fetch messages
async function fetchMessages(supabase, lessonId, userId, messageContent) {
    const messageData = await supabase.from('lessons_ai_task_messages')
        .select('id, message')
        .eq('lesson_id', lessonId)
        .eq('user_id', userId)
        .eq('message', messageContent)
        .order('id', { ascending: true })

    if (messageData.error) {
        console.log('Error getting message from the database', messageData.error)
        return { error: 'Error getting message from the database' }
    }
    return { messages: messageData.data }
}

export async function studentDeleteAiTaskMessage({
    lessonId,
    message
}: {
    lessonId: number,
    message: {
        content: string,
        role: string,
        messageId?: number
    }
}) {
    const supabase = createClient()
    const userData = await getUserData(supabase)
    if (userData.error) return createResponse('error', userData.error, null, userData.error)

    const userId = userData.id
    const messageData = await fetchMessages(supabase, lessonId, userId, message.content)
    if (messageData.error) return createResponse('error', messageData.error, null, messageData.error)

    const messages = messageData.messages
    const messageIndex = messages.findIndex((val) => val.message === message.content)
    if (messageIndex === -1) return createResponse('error', 'Message not found', null, 'Message not found')

    const nextMessages = messages.slice(messageIndex)
    const messagesToDelete = nextMessages.map((msg) => msg.id)
    const deleteResult = await deleteMessages(supabase, messagesToDelete)
    if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

    return revalidatePathAndRespond('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout', 'Message deleted successfully')
}

export async function studentResetAiTaskConversation({
    lessonId
}: {
    lessonId: number
}) {
    const supabase = createClient()
    const userData = await getUserData(supabase)
    if (userData.error) return createResponse('error', userData.error, null, userData.error)

    const userId = userData.id
    const messageData = await supabase.from('lessons_ai_task_messages').select('id').eq('lesson_id', lessonId).eq('user_id', userId)
    if (messageData.error) return createResponse('error', 'Error getting messages from the database', null, 'Error getting messages from the database')

    const messagesToDelete = messageData.data.map((msg) => msg.id)
    const deleteResult = await deleteMessages(supabase, messagesToDelete)
    if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

    // check if the lessons is marked as completed
    const lessonCompletionData = await supabase.from('lesson_completions').select('id').eq('lesson_id', lessonId).eq('user_id', userId).single()

    if (lessonCompletionData.data.id) {
        const deleteCompletionData = await supabase.from('lesson_completions').delete().eq('id', lessonCompletionData.data.id)
        if (deleteCompletionData.error) return createResponse('error', 'Error deleting lesson completion', null, 'Error deleting lesson completion')
    }

    return createResponse('success', 'Message updated successfully', null, null)
}
