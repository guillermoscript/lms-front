import ExamPrepChat from '@/components/dashboards/student/chat/ExamPrepChat'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function FreeChatPage ({
    params
}: {
    params: {
        chatId: string
    }
}) {
    // const supabase = createClient()

    // const messagesData = await supabase
    //     .from('messages')
    //     .select('*')
    //     // .eq('chat_id', Number(params.chatId))
    //     .order('created_at', { ascending: true })

    // if (messagesData.error) {
    //     console.log(messagesData.error)
    //     throw new Error('Error fetching messages')
    // }

    return (
        <>
            <ExamPrepChat />
        </>
    )
}
