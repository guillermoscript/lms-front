import dayjs from 'dayjs' // Assuming dayjs is already being used for date formatting
import { CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

import {
    Timeline,
    TimelineConnector,
    TimelineContent,
    TimelineDescription,
    TimelineHeader,
    TimelineIcon,
    TimelineItem,
    TimelineTime,
    TimelineTitle
} from '@/components/ui/timeline'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'

export default async function LessonsTimeLine ({
    courseId,
    lessonId
}: {
    courseId: number
    lessonId: number
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const { data: items, error } = await supabase
        .from('lessons')
        .select('*, lesson_completions(*)')
        .eq('course_id', courseId)
        .eq('lesson_completions.user_id', user.data.user.id)
        .order('sequence', { ascending: true })

    if (error || !items) {
        console.error(error || 'No lessons found')
        return null
    }

    return (
        <Timeline
            className='w-full py-4'
        >
            {items.map((item, index) => {
                return (
                    <Link
                        href={`/dashboard/student/courses/${courseId}/lessons/${item.id}`}
                        key={index}
                        className={

                            'hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors duration-200 ease-in-out'

                        }
                    >
                        <TimelineItem >
                            <TimelineConnector />
                            <TimelineHeader>
                                <TimelineTime>{item.sequence}</TimelineTime>
                                <TimelineIcon />
                                <TimelineTitle
                                    className={cn(
                                        'text-lg',
                                        item.id === lessonId && 'text-primary'
                                    )}
                                >
                                    {item.title}</TimelineTitle>
                            </TimelineHeader>
                            <TimelineContent
                                className='flex flex-col gap-3'
                            >
                                <TimelineDescription>{item.description}</TimelineDescription>
                                <p>
                                    {dayjs(item.created_at).format('MMMM D, YYYY')}
                                </p>
                                <div className='flex items-center gap-2'>
                                    {item.lesson_completions?.length > 0 ? (
                                        <>
                                            <p className='text-sm font-semibold'>Completed</p>
                                            <CheckCircle className='h-6 w-6 text-green-500' />
                                        </>
                                    ) : (
                                        <>
                                            <p className='text-sm font-semibold'>Not completed</p>
                                            <Clock className='h-6 w-6' />
                                        </>
                                    )}
                                </div>
                            </TimelineContent>
                        </TimelineItem>
                    </Link>
                )
            })}
        </Timeline>
    )
}
