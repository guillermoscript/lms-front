import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink
} from '@/components/ui/pagination'
import { createClient } from '@/utils/supabase/server'
export default async function LessonNavigationButtons ({
    courseId,
    lessonId
}: {
    courseId: number
    lessonId: number
}) {
    const supabase = createClient()
    const lessons = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', courseId)
        .order('sequence', { ascending: true })

    return (
        <Pagination>
            <PaginationContent>
                {lessons.data.map((lesson, index) => (
                    <PaginationItem key={index}>
                        <PaginationLink
                            href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                            isActive={lesson.id === lessonId}
                        >
                            {index + 1}
                        </PaginationLink>
                    </PaginationItem>
                ))}
            </PaginationContent>
        </Pagination>
    )
}
