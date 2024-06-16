import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
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

    const currentIndex = lessons.data.findIndex(lesson => lesson.id === lessonId)
    const hasNext = currentIndex < lessons.data.length - 1
    const hasPrevious = currentIndex > 0

    return (
        <Pagination>
            <PaginationContent>
                {hasPrevious && (
                    <PaginationItem>
                        <PaginationPrevious href={`/dashboard/student/courses/${courseId}/lessons/${lessons.data[currentIndex - 1].id}`} />
                    </PaginationItem>
                )}
                {lessons.data.slice(0, 5).map((lesson, index) => (
                    <PaginationItem key={index}>
                        <PaginationLink
                            href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                            isActive={lesson.id === lessonId}
                        >
                            {index + 1}
                        </PaginationLink>
                    </PaginationItem>
                ))}
                {lessons.data.length > 5 && (
                    <PaginationItem>
                        <PaginationEllipsis />
                    </PaginationItem>
                )}
                {hasNext && (
                    <PaginationItem>
                        <PaginationNext href={`/dashboard/student/courses/${courseId}/lessons/${lessons.data[currentIndex + 1].id}`} />
                    </PaginationItem>
                )}
            </PaginationContent>
        </Pagination>
    )
}
