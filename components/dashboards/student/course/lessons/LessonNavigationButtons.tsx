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
        .select('id, sequence')
        .eq('course_id', courseId)
        .order('sequence', { ascending: true })

    const currentIndex = lessons.data?.findIndex(lesson => lesson.id === lessonId)
    const hasNext = currentIndex < lessons.data.length - 1
    const hasPrevious = currentIndex > 0

    // Determine the range of lessons to display
    const start = Math.max(0, currentIndex - 2)
    const end = Math.min(lessons.data.length, currentIndex + 3)
    const visibleLessons = lessons.data.slice(start, end)

    return (
        <Pagination>
            <PaginationContent
                className="flex flex-wrap md:flex-nowrap items-center space-x-2"
                aria-label="Lesson navigation"
            >
                {hasPrevious && (
                    <PaginationItem>
                        <PaginationPrevious href={`/dashboard/student/courses/${courseId}/lessons/${lessons.data[currentIndex - 1].id}`} />
                    </PaginationItem>
                )}
                {currentIndex > 2 && (
                    <PaginationItem>
                        <PaginationEllipsis />
                    </PaginationItem>
                )}
                {visibleLessons.map((lesson, index) => (
                    <PaginationItem key={lesson.id}>
                        <PaginationLink
                            href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                            isActive={lesson.id === lessonId}
                        >
                            {lesson.sequence}
                        </PaginationLink>
                    </PaginationItem>
                ))}
                {currentIndex < lessons.data.length - 3 && (
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
