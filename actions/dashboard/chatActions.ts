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
    const messageData = await supabase.from('messages').update({ message: newMessage }).eq('id', messageId).select('id').single()
    if (messageData.error) {
        console.log('Error updating message in the database', messageData.error)
        return { error: 'Error updating message in the database' }
    }
    return { id: messageData.data.id }
}

// Helper function to delete messages
async function deleteMessages(supabase, messagesToDelete) {
    const deleteResult = await supabase.from('messages').delete().in('id', messagesToDelete)
    if (deleteResult.error) {
        console.log('Error deleting next messages', deleteResult.error)
        return { error: 'Error deleting next messages' }
    }
    return { success: true }
}

// Helper function to revalidate path and respond
function revalidatePathAndRespond(path, layout, messageId) {
    revalidatePath(path, layout)
    return createResponse('success', 'Message updated successfully', messageId, null)
}

// Helper function to fetch next messages
async function fetchNextMessages(supabase, messageId) {
    const nextMessagesData = await supabase.from('messages').select('id').gt('id', messageId).order('id', { ascending: true })
    if (nextMessagesData.error) {
        console.log('Error getting next message', nextMessagesData.error)
        return { error: 'Error getting next message' }
    }
    return { messages: nextMessagesData.data }
}

// Helper function to fetch messages by user
async function fetchMessagesByUser(supabase, userId) {
    const messageData = await supabase.from('messages').select('id, message').eq('user_id', userId).order('id', { ascending: true })
    if (messageData.error) {
        console.log('Error getting messages from the database', messageData.error)
        return { error: 'Error getting messages from the database' }
    }
    return { messages: messageData.data }
}

export async function studentEditAiMessage({
    sender,
    messageId,
    message,
    newMessage,
    regenerate
}: {
    sender: 'user' | 'assistant',
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
            const nextMessagesData = await fetchNextMessages(supabase, messageId)
            if (nextMessagesData.error) return createResponse('error', nextMessagesData.error, null, nextMessagesData.error)

            if (nextMessagesData.messages) {
                const messagesToDelete = nextMessagesData.messages.map((msg) => msg.id)
                const deleteResult = await deleteMessages(supabase, messagesToDelete)
                if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

                return revalidatePathAndRespond('/dashboard/student/chat/', 'layout', updateResult.id)
            }
        }
        return revalidatePathAndRespond('/dashboard/student/chat/', 'layout', updateResult.id)
    } else {
        const messageData = await fetchMessagesByUser(supabase, userId)
        if (messageData.error) return createResponse('error', messageData.error, null, messageData.error)

        const messages = messageData.messages
        const messageIndex = messages.findIndex((val) => val.message === message)
        if (messageIndex === -1) return createResponse('error', 'Message not found', null, 'Message not found')

        const messageIdToUpdate = messages[messageIndex].id

        if (sender === 'user' && regenerate) {
            const nextMessagesData = await fetchNextMessages(supabase, messageIdToUpdate)
            if (nextMessagesData.error) return createResponse('error', nextMessagesData.error, null, nextMessagesData.error)

            if (nextMessagesData.messages) {
                const messagesToDelete = nextMessagesData.messages.map((msg) => msg.id)
                const deleteResult = await deleteMessages(supabase, messagesToDelete)
                if (deleteResult.error) return createResponse('error', deleteResult.error, null, deleteResult.error)

                const updateResult = await updateMessage(supabase, messageIdToUpdate, newMessage)
                if (updateResult.error) return createResponse('error', updateResult.error, null, updateResult.error)

                return revalidatePathAndRespond('/dashboard/student/chat/', 'layout', updateResult.id)
            }
        } else {
            const updateResult = await updateMessage(supabase, messageIdToUpdate, newMessage)
            if (updateResult.error) return createResponse('error', updateResult.error, null, updateResult.error)

            return revalidatePathAndRespond('/dashboard/student/chat/', 'layout', updateResult.id)
        }
    }
}

// Helper function to fetch messages
async function fetchMessages(supabase, lessonId, userId, messageContent) {
    const messageData = await supabase.from('messages')
        .select('id, message')
        .eq('message', messageContent)
        .order('id', { ascending: true })

    if (messageData.error) {
        console.log('Error getting message from the database', messageData.error)
        return { error: 'Error getting message from the database' }
    }
    return { messages: messageData.data }
}

export async function studentDeleteAikMessage({
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

    return revalidatePathAndRespond('/dashboard/student/chat/', 'layout', null)
}
