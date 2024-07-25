import SearchChats from '@/components/dashboards/chat/SearchChats'
import { createClient } from '@/utils/supabase/server'

export default async function StudentChatSidebar({ userRole }) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const chats = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false })

    if (chats.error) {
        console.log(chats.error)
        throw new Error('Error fetching chats')
    }

    const chatTypes = {
        free_chat: chats.data.filter((chat) => chat.chat_type === 'free_chat'),
        exam_prep: chats.data.filter((chat) => chat.chat_type === 'exam_prep'),
    }

    return (
        <nav className="flex flex-col gap-2 h-auto justify-start w-full border-none items-start ">
            <SearchChats userRole={userRole} chatTypes={chatTypes} />
        </nav>
    )
}
