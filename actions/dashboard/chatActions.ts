'use server'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export async function studentCreateNewChat (state: {
    chatType: Tables<'chats'>['chat_type']
    title: string
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const studentId = userData.data.user?.id

    const chatInsert = await supabase.from('chats').insert({
        user_id: studentId,
        chat_type: state.chatType,
        created_at: new Date().toISOString(),
        title: state.title
    }).select('chat_id').single()

    if (chatInsert.error) {
        return createResponse('error', 'Error creating chat', null, 'Error creating chat')
    }

    // return chat id
    // revalidatePath('/dashboard/student/chat/', 'layout')
    return createResponse('success', 'Chat created successfully', chatInsert.data, null)
}

export async function studentSubmitMessage (state: {
    chatId: number
    message: string
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const studentId = userData.data.user?.id

    const messageInsert = await supabase.from('messages').insert({
        user_id: studentId,
        chat_id: state.chatId,
        content: state.message,
        created_at: new Date().toISOString()
    })

    if (messageInsert.error) {
        return createResponse('error', 'Error creating message', null, 'Error creating message')
    }

    return createResponse('success', 'Message sent successfully', null, null)
}
