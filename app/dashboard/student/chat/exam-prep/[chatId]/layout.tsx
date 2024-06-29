import { AI } from '@/actions/dashboard/ExamPreparationActions'
import { createClient } from '@/utils/supabase/server'

export default async function ExamPrepChatIdLayout ({
    children,
    params
}: {
    children: React.ReactNode
    params: {
        chatId: string
    }
}) {
    const supabase = createClient()

    const chatData = await supabase
        .from('chats')
        .select('*, messages(*)')
        .eq('id', Number(params.chatId))

    if (chatData.error) {
        console.log(chatData.error)
        throw new Error('Error fetching chat data')
    }

    return (
        <>
            <AI>{children}</AI>
        </>
    )
}
