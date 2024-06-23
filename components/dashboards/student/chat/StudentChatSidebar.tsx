import dayjs from 'dayjs'
import Link from 'next/link'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

const ChatAccordion = ({ chatType, userRole, chats }) => (
    <Accordion className='w-full' type="single" collapsible>
        <AccordionItem className='w-full' value={`item-${chatType}`}>
            <AccordionTrigger>{chatType.replace('_', ' ')}</AccordionTrigger>
            <AccordionContent>
                <ul className='w-full flex flex-col gap-3'>
                    {chats.map((chat: Tables<'chats'>) => (
                        <li
                            className='w-full hover:text-gray-900 hover:bg-gray-200 dark:hover:text-gray-50 dark:hover:bg-gray-700 p-2 rounded-lg overflow-hidden text-ellipsis'
                            key={chat.chat_id}
                        >
                            <Link href={`/dashboard/${userRole}/chat/${chat.chat_id}/${chatType}`}>
                                {chat.title}
                            </Link>
                            <p className='text-sm text-gray-500 dark:text-gray-400'>
                                {dayjs(chat.created_at).format('MMM D, YYYY')}
                            </p>
                        </li>
                    ))}
                </ul>
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
        qna: chats.data.filter(chat => chat.chat_type === 'q&a'),
        exam_prep: chats.data.filter(chat => chat.chat_type === 'exam_prep'),
        course_chat: chats.data.filter(chat => chat.chat_type === 'course_convo')
    }

    return (
        <nav className="flex flex-col gap-2 h-auto justify-start w-full border-none px-4 py-2 items-start bg-gray-100/40 dark:bg-gray-800/40">
            {Object.entries(chatTypes).map(([type, chats]) => (
                <ChatAccordion key={type} chatType={type} userRole={userRole} chats={chats} />
            ))}
        </nav>
    )
}
