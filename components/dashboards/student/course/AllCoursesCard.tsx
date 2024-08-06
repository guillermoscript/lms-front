
import { CarouselItem } from '@/components/ui/carousel'

import CarouselCourse from './CarouselCourse'
import CourseCard from './CourseCard'
import LinkCourseCard from './LinksCourseCards'

export default async function AllCoursesCard ({
    supabase,
    userId
}: {
    supabase: any
    userId: string
}) {
    const allCourses = await supabase
        .from('courses')
        .select('*, enrollments(user_id)')
        .eq('status', 'published')
        .eq('enrollments.user_id', userId)

    if (allCourses.error != null) {
        throw new Error(allCourses.error.message)
    }

    return (
        <div className="w-full max-w-xs sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto px-4">
            <CarouselCourse>
                {allCourses.data.map((course) => (
                    <CarouselItem key={course.course_id} className="w-full sm:basis-1/2 lg:basis-1/3">
                        <div className="h-full flex-grow">
                            <CourseCard
                                title={course.title}
                                description={course.description}
                                courseId={course.course_id}
                                img={course.thumbnail_url}
                            >
                                <LinkCourseCard
                                    courseId={course.course_id}
                                    noEnroll={course.enrollments.length === 0}
                                />
                            </CourseCard>
                        </div>
                    </CarouselItem>
                ))}
            </CarouselCourse>
        </div>
    )
}
