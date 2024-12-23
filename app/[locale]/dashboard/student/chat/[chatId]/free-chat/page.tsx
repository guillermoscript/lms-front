import ChatContent from "@/components/dashboards/chat/Chatsv2/ChatContent"
import { createClient } from "@/utils/supabase/server"

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function FreeChatPage({
    params,
}: {
    params: {
        chatId: string
    }
}) {

    const supabase = await createClient()
    const userData = await supabase.auth.getUser()

    const chat = await supabase
        .from('chats')
        .select('*, messages(*)')
        .eq('chat_id', params.chatId)
        .eq('user_id', userData.data.user.id)
        .single()

    const formattedMessages = chat.data.messages.map((message: any) => {
        if (message.sender === 'tool') {
            try {
                const parsedMessage = JSON.parse(message.message || '{}')
                return {
                    id: message.id.toString(),
                    role: message.sender,
                    content: '',
                    toolInvocations: parsedMessage.toolInvocations,
                    createdAt: new Date(message.created_at)
                }
            } catch (e) {
                return null
            }
        }

        return {
            ...message,
            content: message.message || '',
            role: message.sender,
            id: message.id.toString(),
            createdAt: new Date(message.created_at)
        }
    }
    ).filter(Boolean) || []

    return (
        <>
            <ChatContent
                chatType="free_chat"
                chatMessages={formattedMessages}
            />
        </>
    )
}
