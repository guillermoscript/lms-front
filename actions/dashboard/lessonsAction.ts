
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
    } else {
        const id = userData.data.user.id
        const messageData = await supabase.from('lessons_ai_task_messages').insert({
            user_id: id,
            message: message.content,
            sender: message.role as 'assistant' | 'user',
            lesson_id: lessonId
        })
        if (messageData.error) {
            console.log('Error adding message to the database', messageData.error)
            return createResponse('error', 'Error adding message to the database', null, 'Error adding message to the database')
        }
    }

    return createResponse('success', 'Message sent successfully', null, null)
}
