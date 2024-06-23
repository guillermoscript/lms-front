import FreeChat from '@/components/dashboards/student/chat/FreeChat'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function FreeChatPage ({
    params
}: {
    params: {
        chatId: string
    }
}) {
    const supabase = createClient()

    const messagesData = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', Number(params.chatId))
        .order('created_at', { ascending: true })

    if (messagesData.error) {
        console.log(messagesData.error)
        throw new Error('Error fetching messages')
    }

    return (

        <>
            <h1 className="text-2xl font-semibold text-gray-800">
                Free Chat
            </h1>
            <div className='flex flex-col gap-4 overflow-y-auto h-[calc(100vh-4rem)]'>

                <FreeChat
                    chatId={Number(params.chatId)}
                    initialMessages={
                        messagesData.data.map(message => ({
                            id: message.id.toString(),
                            content: message.message,
                            role: message.sender
                        }))
                    }
                />
            </div>
        </>
    )
}
