import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'

import CourseCard from './CourseCard'
import EnrollButton from './EnrollButton'

export default async function AllCoursesCard ({
    supabase,
    userId
}: {
    supabase: any
    userId: string
}) {
    const allCourses = await supabase
        .from('courses')
        .select('*, lessons(*), exams(*), enrollments(*)')
        .eq('status', 'published')
        .eq('enrollments.user_id', userId)

    if (allCourses.error != null) {
        throw new Error(allCourses.error.message)
    }

    return (
        <div className="w-full max-w-xs sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto px-4">
            <Carousel
                opts={{
                    align: 'start',
                    loop: true,
                    breakpoints: {
                        '(min-width: 768px)': {
                            loop: false
                        }
                    }
                }}
            >
                <CarouselContent className="flex gap-4">
                    {allCourses.data.map((course) => (
                        <CarouselItem key={course.course_id} className="w-full sm:basis-1/2 lg:basis-1/3">
                            <div className="h-full flex-grow">
                                <CourseCard
                                    title={course.title}
                                    description={course.description}
                                    courseId={course.course_id}
                                    img={course.thumbnail_url}
                                >
                                    {course.enrollments.length === 0 ? (
                                        <EnrollButton courseId={course.course_id} />
                                    ) : null}
                                </CourseCard>
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
        </div>
    )
}
