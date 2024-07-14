import { FreeChatAI, getUIStateFromFreeChatAIState } from '@/actions/dashboard/AI/FreeChatPreparation'
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

    // WTF!!!! why this need an await?????
    const uiState = await getUIStateFromFreeChatAIState({
        id: messagesData.data.chat_id.toString(),
        createdAt: new Date(messagesData.data.created_at),
        messages: messagesData.data.messages.map((message) => {
            if (!message) return null

            if (message.sender === 'tool') {
                return ({
                    id: message.id,
                    role: message.sender as any,
                    content: JSON.parse(message.message)
                })
            }

            if (message.sender === 'assistant') {
                // if the content is a json stringified object then parse it
                if (message.message.startsWith('{') || message.message.startsWith('[')) {
                    return ({
                        id: message.id,
                        role: message.sender as any,
                        content: JSON.parse(message.message)
                    })
                }
                return ({
                    id: message.id,
                    role: message.sender as any,
                    content: message.message
                })
            }

            return ({
                id: message.id,
                role: message.sender as any,
                content: message.message
            })
        }) as any
    })

    const messsages = messagesData.data.messages.map((message) => {
        if (message.sender === 'tool') {
            return ({
                id: message.id.toString(),
                role: message.sender as any,
                content: JSON.parse(message.message)
            })
        }

        if (message.sender === 'assistant') {
            // if the content is a json stringified object then parse it
            if (message.message.startsWith('{') || message.message.startsWith('[')) {
                return ({
                    id: message.id.toString(),
                    role: message.sender as any,
                    content: JSON.parse(message.message)
                })
            }

            return ({
                id: message.id.toString(),
                role: message.sender as any,
                content: message.message
            })
        }

        return ({
            id: message.id.toString(),
            role: message.sender as any,
            content: message.message
        })
    })

    return (
        <FreeChatAI
            initialUIState={uiState}
            initialAIState={{ chatId: (params.chatId), messages: messsages }}
        >
            {children}
        </FreeChatAI>
    )
}