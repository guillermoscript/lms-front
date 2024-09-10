import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import TeacherTestForm from '@/components/form/TeacherTestForm'
import { createClient } from '@/utils/supabase/server'

export default async function TestFormPage ({
    params
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const course = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', params.courseId)
        .single()

    if (course.error != null) {
        console.log(course.error.message)
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto w-full space-y-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/teacher', label: 'Teacher' },
                    { href: '/dashboard/teacher/courses', label: 'Courses' },
                    { href: `/dashboard/teacher/courses/${params.courseId}`, label: course?.data?.title },
                    { href: `/dashboard/teacher/courses/${params.courseId}/tests`, label: 'Tests' }
                ]}
            />
            <TeacherTestForm
                courseId={params.courseId}
            />
        </div>
    )
}
