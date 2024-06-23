import Link from 'next/link'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion'
import { createClient } from '@/utils/supabase/server'

export default async function StudentChatSidebar ({
    userRole
}: {
    userRole: 'student'
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const chats = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false })
        .limit(5)

    if (chats.error) {
        console.log(chats.error)
        throw new Error('Error fetching chats')
    }

    const freeChatTypes = chats.data.filter(chat => chat.chat_type === 'free_chat')
    const qnaTypes = chats.data.filter(chat => chat.chat_type === 'q&a')
    const examPrepTypes = chats.data.filter(chat => chat.chat_type === 'exam_prep')
    const courseChatTypes = chats.data.filter(chat => chat.chat_type === 'course_convo')

    return (
        <nav className="flex flex-col gap-2 h-auto justify-start w-full border-none px-4 py-2 items-start bg-gray-100/40 dark:bg-gray-800/40  ">
            <Accordion
                className='w-full'
                type="single" collapsible
            >
                <AccordionItem
                    className='w-full'
                    value="item-1"
                >
                    <AccordionTrigger>
                        Free Chat
                    </AccordionTrigger>
                    <AccordionContent>
                        <ul className='w-full flex flex-col gap-2'>
                            {freeChatTypes.map(chat => (
                                <li
                                    className='w-full hover:text-gray-900 dark:hover:text-gray-50'
                                    key={chat.chat_id}
                                >
                                    <Link
                                        href={`/dashboard/${userRole}/chat/${chat.chat_id}/free-chat`}
                                    >
                                        {chat.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            <Accordion
                className='w-full'
                type="single" collapsible
            >
                <AccordionItem
                    className='w-full'
                    value="item-1"
                >
                    <AccordionTrigger>
                        Q&A
                    </AccordionTrigger>
                    <AccordionContent>
                        <ul className='w-full flex flex-col gap-2'>
                            {qnaTypes.map(chat => (
                                <li
                                    className='w-full hover:text-gray-900 dark:hover:text-gray-50'
                                    key={chat.chat_id}
                                >
                                    <Link
                                        href={`/dashboard/${userRole}/chat/${chat.chat_id}/qna`}
                                    >
                                        {chat.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            <Accordion
                className='w-full'
                type="single" collapsible
            >
                <AccordionItem
                    className='w-full'
                    value="item-1"
                >
                    <AccordionTrigger>
                        Exam Preparation
                    </AccordionTrigger>
                    <AccordionContent>
                        <ul className='w-full flex flex-col gap-2'>
                            {examPrepTypes.map(chat => (
                                <li
                                    className='w-full hover:text-gray-900 dark:hover:text-gray-50'
                                    key={chat.chat_id}
                                >
                                    <Link
                                        href={`/dashboard/${userRole}/chat/${chat.chat_id}/exam-prep`}
                                    >
                                        {chat.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            <Accordion
                className='w-full'
                type="single" collapsible
            >
                <AccordionItem
                    className='w-full'
                    value="item-1"
                >
                    <AccordionTrigger>
                        Course Convo
                    </AccordionTrigger>
                    <AccordionContent>
                        <ul className='w-full flex flex-col gap-2'>
                            {courseChatTypes.map(chat => (
                                <li
                                    className='w-full hover:text-gray-900 dark:hover:text-gray-50'
                                    key={chat.chat_id}
                                >
                                    <Link
                                        href={`/dashboard/${userRole}/chat/${chat.chat_id}/course-chat`}
                                    >
                                        {chat.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

        </nav>
    )
}
