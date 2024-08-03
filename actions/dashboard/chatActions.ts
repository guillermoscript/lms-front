'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

    const messageInsert = await supabase.from('messages').insert({
        chat_id: chatInsert.data.chat_id,
        message: state.title,
        sender: 'user',
        created_at: new Date().toISOString()
    })

    if (chatInsert.error) {
        return createResponse('error', 'Error creating chat', null, 'Error creating chat')
    }

    if (messageInsert.error) {
        return createResponse('error', 'Error creating message', null, 'Error creating message')
    }

    // return chat id
    revalidatePath('/dashboard/student/chat/', 'layout')
    return createResponse('success', 'Chat created successfully', chatInsert.data, null)
}

export async function studentCreateNewChatAndRedirect (state: {
    chatType: Tables<'chats'>['chat_type']
    title: string
    insertMessage?: boolean
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

    if (state.insertMessage) {
        const messageInsert = await supabase.from('messages').insert({
            chat_id: chatInsert.data.chat_id,
            message: state.title,
            sender: 'user',
            created_at: new Date().toISOString()
        })

        if (messageInsert.error) {
            console.log(messageInsert.error)
            return createResponse('error', 'Error creating message', null, 'Error creating message')
        }
    }

    if (chatInsert.error) {
        console.log(chatInsert.error)
        return createResponse('error', 'Error creating chat', null, 'Error creating chat')
    }

    const url = '/dashboard/student/chat/' + chatInsert.data.chat_id + '/' + state.chatType.replaceAll('_', '-')
    console.log(url, 'url')
    // return chat id
    redirect(url)
}

export async function studentInsertChatMessage (state: {
    chatId: number
    message: string
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const messageInsert = await supabase.from('messages').insert({
        chat_id: state.chatId,
        message: state.message,
        sender: 'user',
        created_at: new Date().toISOString()
    })

    if (messageInsert.error) {
        return createResponse('error', 'Error creating message', null, 'Error creating message')
    }

    return createResponse('success', 'Message sent successfully', null, null)
}

export async function studentUpdateChatTitle (state: {
    chatId: number
    title: string
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const chatUpdate = await supabase.from('chats').update({
        title: state.title
    }).eq('chat_id', state.chatId)

    if (chatUpdate.error) {
        return createResponse('error', 'Error updating chat', null, 'Error updating chat')
    }

    revalidatePath('/dashboard/student/chat/', 'layout')
    return createResponse('success', 'Chat updated successfully', null, null)
}

export async function insertChatMessage (state: {
    chatId: number
    message: string
    sender: Tables<'messages'>['sender']
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const messageInsert = await supabase.from('messages').insert({
        chat_id: state.chatId,
        message: state.message,
        sender: state.sender,
        created_at: new Date().toISOString()
    })

    if (messageInsert.error) {
        return createResponse('error', 'Error creating message', null, 'Error creating message')
    }

    return createResponse('success', 'Message sent successfully', null, null)
}

export async function studentUpdateChat (state: {
    chatId: number
    title: string
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const chatUpdate = await supabase.from('chats').update({
        title: state.title
    }).eq('chat_id', state.chatId)

    if (chatUpdate.error) {
        return createResponse('error', 'Error updating chat', null, 'Error updating chat')
    }

    // revalidatePath('/dashboard/student/chat/', 'layout')
    return createResponse('success', 'Chat updated successfully', null, null)
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

    const messageInsert = await supabase.from('messages').insert({
        chat_id: state.chatId,
        message: state.message,
        sender: 'user',
        created_at: new Date().toISOString()
    })

    if (messageInsert.error) {
        console.log(messageInsert.error)
        return createResponse('error', 'Error creating message', null, 'Error creating message')
    }

    return createResponse('success', 'Message sent successfully', null, null)
}

export async function deleteChat (state: {
    chatId: number
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
    }

    const chatDelete = await supabase.from('chats').delete().eq('chat_id', state.chatId)

    if (chatDelete.error) {
        return createResponse('error', 'Error deleting chat', null, 'Error deleting chat')
    }

    revalidatePath('/dashboard/student/chat/', 'layout')
    return createResponse('success', 'Chat deleted successfully', null, null)
}
