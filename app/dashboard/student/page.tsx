import { ChatBubbleIcon } from '@radix-ui/react-icons'
import dayjs from 'dayjs'
import Link from 'next/link'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import CourseSectionComponent from '@/components/dashboards/student/course/CourseSectionComponent'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export default async function CoursesStudentPage() {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const userCourses = await supabase
        .from('enrollments')
        .select('*, course:course_id(*,lessons(*), exams(*))')
        .eq('user_id', user.data.user.id)

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.data.user.id)

    const userChats = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.data.user.id)

    if (userCourses.error) throw new Error(userCourses.error.message)
    if (userSubscriptions.error) { throw new Error(userSubscriptions.error.message) }

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/student', label: 'Student' },
                ]}
            />
            <CourseSectionComponent
                userCourses={userCourses.data}
                userSubscriptions={userSubscriptions.data}
                userId={user.data.user.id}
                supabase={supabase}
                layoutType="flex"
            />
            <ChatsSectionComponent chats={userChats.data} />
        </>
    )
}

function ChatsSectionComponent({ chats }: { chats: Array<Tables<'chats'>> }) {
    return (
        <div>
            <div className="p-4 flex items-center gap-4 py-4 md:py-14">
                <ChatBubbleIcon className="h-6 w-6" />
                <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                    Your Chats
                </h3>
            </div>
            <div className="flex flex-wrap gap-4 w-full justify-around items-center">
                {chats.map((chat) => (
                    <div
                        className="w-full md:w-1/2 lg:w-1/3 xl:w-1/4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4"
                        key={chat.chat_id}
                    >
                        <Link href={`/dashboard/student/chats/${chat.chat_id}`}
                            className="p-4 border-b border-neutral-200 dark:border-neutral-700"
                        >
                            <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">
                                {chat.title.slice(0, 30) +
                                    (chat.title.length > 30 ? '...' : '')}
                            </h4>
                        </Link>
                        <div className='flex items-center gap-2'>
                            {chat.chat_type === 'free_chat' ? (
                                <Badge
                                    variant='outline'
                                    className="text-sm text-neutral-600 dark:text-neutral-300"
                                >
                                Free Chat
                                </Badge>
                            ) : chat.chat_type === 'exam_prep' ? (
                                <Badge
                                    variant='outline'
                                    className="text-sm text-neutral-600 dark:text-neutral-300"
                                >
                                Exam Prep
                                </Badge>
                            ) : null}
                            <p>
                                {dayjs(chat.created_at).format('MMMM D, YYYY')}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
