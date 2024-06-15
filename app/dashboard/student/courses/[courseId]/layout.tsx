
import EnrollButton from '@/components/dashboards/student/course/EnrollButton'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesPageLayout ({
    children,
    params
}: {
    children: React.ReactNode
    params: {
        courseId: string
    }
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }
    const isUserEnrolled = await supabase
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', user.data.user.id)
        .eq('course_id', params.courseId)

    if (isUserEnrolled.error != null) {
        if (isUserEnrolled.error.code === 'PGRST116') {
            return (
                <div className='grid gap-8'>
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
                                    href="/dashboard/student/courses"
                                >
                            Courses
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                        You are not enrolled in this course
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className=' mb-4'>
                                        You need to enroll in this course to access the lessons.
                            </p>
                            <EnrollButton courseId={Number(params.courseId)} />
                        </CardContent>
                    </Card>
                </div>
            )
        }
        throw new Error(isUserEnrolled.error.message)
    }

    return (
        <>
            {children}
        </>
    )
}
