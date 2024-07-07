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

    return allCourses.data.map((course) => {
        return (
            <>
                <CourseCard
                    title={course.title}
                    progress={75}
                    description={course.description}
                    totalLessons={course.lessons.length}
                    completedLessons={18}
                    completedTests={5}
                    totalTests={course.exams.length}
                    approvedTests={4}
                    courseId={course.course_id}
                    img={course.thumbnail_url}
                >
                    {
                        course.enrollments.length === 0 ? (
                            <EnrollButton
                                courseId={course.course_id}
                            />
                        ) : null
                    }
                </CourseCard>
            </>
        )
    }
    )
}
