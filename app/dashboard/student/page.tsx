import { BookTextIcon } from 'lucide-react'

import CourseCard from '@/components/dashboards/student/course/CourseCard'
import EnrollButton from '@/components/dashboards/student/course/EnrollButton'
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
            `*,
            course:course_id(*,lessons(*), exams(*))
	    `)
        .eq('user_id', user.data.user.id)

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.data.user.id)

    if (userCourses.error != null) {
        throw new Error(userCourses.error.message)
    }

    if (userSubscriptions.error != null) {
        throw new Error(userSubscriptions.error.message)
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
                </BreadcrumbList>
            </Breadcrumb>

            {userSubscriptions?.data?.length > 0 ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <BookTextIcon className='h-6 w-6' />
                        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                    Your Courses
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        <AllCoursesCard
                            userId={user.data.user.id}
                            supabase={supabase}
                        />
                    </div>
                </div>
            ) : userCourses?.data?.length > 0 ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <BookTextIcon className='h-6 w-6' />
                        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                    Your Courses
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {userCourses.data.map((course) => {
                            return (
                                <>
                                    <CourseCard
                                        title={(course.course as any)?.title}
                                        progress={75}
                                        totalLessons={
                                            (course.course as any)?.lessons?.length
                                        }
                                        img={(course.course as any)?.thumbnail_url}
                                        completedLessons={18}
                                        completedTests={5}
                                        description={(course.course as any)?.description}
                                        totalTests={(course.course as any)?.exams.length}
                                        approvedTests={4}
                                        courseId={course.course_id}
                                    />
                                </>
                            )
                        })}
                    </div>
                </div>

            ) : (
                <div className="p-4 flex flex-col gap-4">
                    <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                        No Courses or Subscriptions
                    </h2>
                </div>
            )}
        </>
    )
}

async function AllCoursesCard ({
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
