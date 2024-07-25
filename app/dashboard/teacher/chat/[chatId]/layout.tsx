import { createClient } from '@/utils/supabase/server'

export default async function CoursesLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: {
        chatId: string
    }
}) {
    const supabase = createClient()

    const chatData = await supabase
        .from('chats')
        .select('*')
        .eq('chat_id', Number(params.chatId))
        .single()

    if (chatData.error) {
        throw new Error('Error fetching chat')
    }

    return <div className="flex flex-col gap-4 p-2 lg:p-4">{children}</div>
}
