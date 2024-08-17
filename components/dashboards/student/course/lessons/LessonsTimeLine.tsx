// Assuming dayjs is already being used for date formatting

import dayjs from 'dayjs'

import TimelineItem from '@/components/ui/timeline'
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
        <ol className="relative border-s border-gray-200 dark:border-gray-700 px-2">
            {items.map((item, index) => (
                <TimelineItem
                    key={index}
                    title={item.title}
                    date={dayjs(item.created_at).format('MMM D, YYYY')}
                    description={item.description}
                    latest={item.id === lessonId}
                    isCheck={item.lesson_completions.length > 0}
                    link={`/dashboard/student/courses/${courseId}/lessons/${item.id}`}
                />
            ))}
        </ol>
    )
}
