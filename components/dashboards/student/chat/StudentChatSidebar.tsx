
import ChatSidebarItem from '@/components/dashboards/student/chat/ChatSidebarItem'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

const ChatAccordion = ({ chatType, userRole, chats }) => (
    <Accordion className='w-full' type="single" collapsible>
        <AccordionItem className='w-full' value={`item-${chatType}`}>
            <AccordionTrigger
                className='w-full text-lg font-semibold capitalize'
            >{chatType.replace('_', ' ')}</AccordionTrigger>
            <AccordionContent>
                <ScrollArea className="h-[calc(100vh-4rem)]  w-full rounded-md border p-4">

                    <ul className='w-full flex flex-col gap-3'>
                        {chats.map((chat: Tables<'chats'>) => {
                            const types = {
                                free_chat: 'free-chat',
                                qna: 'qa',
                                exam_prep: 'exam-prep',
                                course_chat: 'study-material'
                            }

                            return (
                                <ChatSidebarItem
                                    key={chat.chat_id}
                                    chat={chat}
                                    chatType={types[chatType]}
                                    userRole={userRole}
                                />
                            )
                        })}
                    </ul>
                </ScrollArea>
            </AccordionContent>
        </AccordionItem>
    </Accordion>
)

export default async function StudentChatSidebar ({ userRole }) {
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
        free_chat: chats.data.filter(chat => chat.chat_type === 'free_chat'),
        exam_prep: chats.data.filter(chat => chat.chat_type === 'exam_prep')
    }

    return (
        <nav className="flex flex-col gap-2 h-auto justify-start w-full border-none px-4 py-2 items-start bg-gray-100/40 dark:bg-gray-800/40">
            {Object.entries(chatTypes).map(([type, chats]) => (
                <ChatAccordion key={type} chatType={type} userRole={userRole} chats={chats} />
            ))}
        </nav>
    )
}
