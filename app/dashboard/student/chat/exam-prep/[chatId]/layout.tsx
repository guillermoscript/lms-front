import { AI, getUIStateFromAIState, Message } from '@/actions/dashboard/ExamPreparationActions'
import { createClient } from '@/utils/supabase/server'

export default async function ExamnChatIdPageLayout ({
    params,
    children
}: {
    params: {
        chatId: string
    }
    children: React.ReactNode
}) {
    const supabase = createClient()

    const messagesData = await supabase
        .from('chats')
        .select('*, messages(*)')
        .eq('chat_id', Number(params.chatId))
        .order('created_at', { foreignTable: 'messages', ascending: true })
        .single()

    if (messagesData.error) {
        console.log(messagesData.error)
        throw new Error('Error fetching messages')
    }

    const messages = messagesData.data.messages.map(data => {
        if (data.sender === 'tool') {
            return {
                role: data.sender,
                id: data.id,
                content: [
                    JSON.parse(data.message)
                ] // Add a default value for the 'content' property
            }
        }
        return {
            role: data.sender,
            id: data.id,
            content: data.message // Add a default value for the 'content' property
        }
    }) as unknown as Message[]

    const uiState = messages.length === 0 ? [] : await getUIStateFromAIState(messages)

    return (
        <AI
            initialUIState={uiState}
            initialAIState={{ chatId: (params.chatId), messages }}
        >
            {children}
        </AI>
    )
}
