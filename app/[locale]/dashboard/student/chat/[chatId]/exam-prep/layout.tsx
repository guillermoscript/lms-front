import { AI, getUIStateFromAIState } from '@/actions/dashboard/AI/ExamPreparationActions'
import { getScopedI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
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
    const uiState = await getUIStateFromAIState({
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

    const t = await getScopedI18n('BreadcrumbComponent')

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('dashboard') },
                    { href: '/dashboard/student', label: t('student') },
                    { href: '/dashboard/student/chat', label: t('chat') },
                    { href: `/dashboard/student/chat/${params.chatId}`, label: messagesData.data.title.slice(0, 40) + '...' }
                ]}
            />
            <AI
                initialUIState={uiState}
                initialAIState={{ chatId: (params.chatId), messages: messsages }}
            >
                {children}
            </AI>
        </>
    )
}
