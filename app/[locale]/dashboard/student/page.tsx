import { Suspense } from 'react'

import EnhancedStudentDashboard from '@/components/dashboards/student/course/enhanced-student-dashboard'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesStudentPage() {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    // const t = await getScopedI18n('studentDashboard')

    const userCourses = await supabase
        .from('enrollments')
        .select('*, course:course_id(*,lessons(*), exams(*))')
        .eq('user_id', user.data.user.id)

    const lessonsView = await supabase
        .from('distinct_lesson_views')
        .select(
            `
            lesson_id,
            viewed_at,
            lesson_title,
            lesson_description,
            lesson_course_id,
            lesson_image,
            lesson_sequence
            `
        )
        .eq('user_id', user.data.user.id)
        .order('viewed_at', { ascending: false })
        .limit(6)

    const userChats = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.data.user.id)

    if (userCourses.error) throw new Error(userCourses.error.message)
    if (lessonsView.error) throw new Error(lessonsView.error.message)
    if (userChats.error) throw new Error(userChats.error.message)

    return (
        <Suspense fallback={<div>loading</div>}>
            <EnhancedStudentDashboard
                userCourses={userCourses.data as any}
                lessonsView={lessonsView.data as any}
                userChats={userChats.data}

            />
        </Suspense>
    )
}
