import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import EditCourse from '@/components/dashboards/teacher/course/EditCourse'
import { createClient } from '@/utils/supabase/server'

export default async function EditCoursePage({
    params,
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const courseData = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', params.courseId)
        .single()

    if (courseData.error) {
        console.log(courseData.error)
        throw new Error(courseData.error.message)
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto w-full space-y-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/teacher', label: 'Teacher' },
                    { href: '/dashboard/teacher/courses', label: 'Courses' },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}`,
                        label: courseData.data.title,
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/edit`,
                        label: 'Edit',
                    },
                ]}
            />
            <h1 className="text-2xl font-semibold">EditCoursePage</h1>
            <EditCourse courseData={courseData.data} />
        </div>
    )
}
