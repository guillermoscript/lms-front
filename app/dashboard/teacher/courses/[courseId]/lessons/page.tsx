import LessonForm from '@/components/dashboard/teacher/lessons/LessonForm'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CreateLessonPage ({
    params
}: {
    params: { courseId: string, lessonId: string }
}) {
    const supabase = createClient()
    const course = await supabase
        .from('courses')
        .select('*')
        .eq('id', params.courseId)
        .single()

    if (course.error != null) {
        console.log(course.error.message)
    }
    console.log(params)
    console.log(course)
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
                        <BreadcrumbLink href="/dashboard/teacher">
                          Teacher
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard/teacher/courses">
                          Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            href={`/dashboard/teacher/courses/${params.courseId}/`}
                        >
                            {course?.data?.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink>Create Lesson</BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <LessonForm params={params} />
        </>
    )
}
