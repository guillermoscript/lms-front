// @ts-nocheck

import CourseCard from '@/components/dashboards/student/course/CourseCard'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesStudentPage () {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    const userCourses = await supabase
        .from('enrollments')
        .select(
            `*
		,course:course_id(*,lessons(*), exams(*))
	`
        )
        .eq('user_id', user.data.user.id)

    if (userCourses.error != null) {
        throw new Error(userCourses.error.message)
    }

    return (
        <>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">
                          Dashboard
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href="/dashboard/student"
                        >
                            Student
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={'/dashboard/student/courses/'}
                        >
                            Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {userCourses?.data?.length > 0 ? (
                <div className="p-4 flex flex-col gap-4">
                    <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                        Your Courses
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 ">
                        {userCourses.data.map((course) => {
                            return (
                                <>
                                    <CourseCard
                                        title={course.course.title}
                                        progress={75}
                                        totalLessons={
                                            course.course.lessons.length
                                        }
                                        completedLessons={18}
                                        completedTests={5}
                                        totalTests={course.course.exams.length}
                                        approvedTests={4}
                                        courseId={course.course_id}
                                    />
                                </>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <p className="text-center text-gray-600 dark:text-gray-400">
                    You have not enrolled in any courses yet.
                </p>
            )}
        </>
    )
}
