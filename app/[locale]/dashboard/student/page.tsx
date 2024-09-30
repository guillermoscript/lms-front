import { ChatBubbleIcon } from '@radix-ui/react-icons'
import dayjs from 'dayjs'
import { Loader } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

import { getScopedI18n } from '@/app/locales/server'
import BreadcrumbComponent, {
    BreadcrumbComponentLoading,
} from '@/components/dashboards/student/course/BreadcrumbComponent'
import CourseSectionComponent, {
    CourseSectionComponentLoading,
} from '@/components/dashboards/student/course/CourseSectionComponent'
import RecentlyViewed, {
    RecentlyViewedLoading,
} from '@/components/dashboards/student/course/lessons/RecentluViewed'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export default async function CoursesStudentPage() {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    const t = await getScopedI18n('BreadcrumbComponent')

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

    const lessonsView = await supabase
        .from('distinct_lesson_views')
        .select(
            `
        lesson_id,
        viewed_at,
        lesson_title,
        lesson_description,
        lesson_course_id,
        lesson_image,
        lesson_sequence`
        )
        .eq('user_id', user.data.user.id)
        .order('viewed_at', { ascending: false })
        .limit(6)

    if (userCourses.error) throw new Error(userCourses.error.message)
    if (userSubscriptions.error) {
        throw new Error(userSubscriptions.error.message)
    }

    return (
        <>
            <Suspense fallback={<BreadcrumbComponentLoading />}>
                <BreadcrumbComponent
                    links={[
                        { href: '/dashboard', label: t('dashboard') },
                        { href: '/dashboard/student', label: t('student') },
                    ]}
                />
            </Suspense>
            <Suspense fallback={<CourseSectionComponentLoading />}>
                <CourseSectionComponent
                    userCourses={userCourses.data}
                    userSubscriptions={userSubscriptions.data}
                    userId={user.data.user.id}
                    supabase={supabase}
                    layoutType="flex"
                />
            </Suspense>
            {lessonsView.data.length > 0 && (
                <Suspense fallback={<RecentlyViewedLoading />}>
                    <RecentlyViewed lessonsView={lessonsView.data} />
                </Suspense>
            )}
            {/* {userChats.data.length > 0 && (
                <Suspense fallback={<Loader className="mx-auto my-8" />}>
                    <ChatsSectionComponent chats={userChats.data} />
                </Suspense>
            )} */}
        </>
    )
}

async function ChatsSectionComponent({
    chats,
}: {
    chats: Array<Tables<'chats'>>
}) {
    const t = await getScopedI18n('ChatsSectionComponent')

    return (
        <div>
            <div className="p-4 flex items-center gap-4 py-4 md:py-14">
                <ChatBubbleIcon className="h-6 w-6" />
                <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                    {t('title')}
                </h3>
            </div>
            <div className="flex flex-wrap gap-4 w-full justify-around items-center">
                {chats.map((chat) => {
                    return (
                        <div
                            className="w-full md:w-1/2 lg:w-1/3 xl:w-1/4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 flex flex-col gap-2 items-start"
                            key={chat.chat_id}
                        >
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    {chat.chat_type === 'free_chat' ? (
                                        <Badge
                                            variant="outline"
                                            className="text-sm text-neutral-600 dark:text-neutral-300"
                                        >
                                            {t('freeChat')}
                                        </Badge>
                                    ) : chat.chat_type === 'exam_prep' ? (
                                        <Badge
                                            variant="outline"
                                            className="text-sm text-neutral-600 dark:text-neutral-300"
                                        >
                                            {t('examPrep')}
                                        </Badge>
                                    ) : null}
                                </div>
                                <p>
                                    {dayjs(chat.created_at).format(
                                        'MMMM D, YYYY'
                                    )}
                                </p>
                            </div>
                            <Link
                                href={`/dashboard/student/chat/${
                                    chat.chat_id
                                }/${chat.chat_type.replace('_', '-')}`}
                                className="p-4 border-b border-neutral-200 dark:border-neutral-700 w-full"
                            >
                                <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">
                                    {chat.title.slice(0, 30) +
                                        (chat.title.length > 30 ? '...' : '')}
                                </h4>
                            </Link>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
