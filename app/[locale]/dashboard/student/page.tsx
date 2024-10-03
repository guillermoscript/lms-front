import EnhancedStudentDashboard from '@/components/dashboards/student/course/enhanced-student-dashboard'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesStudentPage() {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

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

    const subscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)

    const coursesQuery = subscriptions.data.length > 0
        ? supabase
            .from('courses')
            .select(`
                course_id,
                title,
                description,
                thumbnail_url,
                lessons(id, title),
                exams(exam_id)
            `)
            .eq('status', 'published')
        : supabase
            .from('enrollments')
            .select(`
                course_id,
                course:course_id(
                    title,
                    description,
                    thumbnail_url,
                    lessons(id, title),
                    exams(exam_id)
                )
            `)
            .eq('user_id', user.data.user.id)

    const coursesResult = await coursesQuery

    if (coursesResult.error) throw new Error(coursesResult.error.message)
    if (lessonsView.error) throw new Error(lessonsView.error.message)
    if (userChats.error) throw new Error(userChats.error.message)

    const courses = coursesResult.data.map((course) => {
        return {
            course_id: course.course_id,
            course: {
                title: course.title,
                description: course.description,
                thumbnail_url: course.thumbnail_url,
                lessons: course.lessons,
                exams: course.exams,
            },
        }
    })

    return (
        <EnhancedStudentDashboard
            userCourses={courses}
            lessonsView={lessonsView.data as any}
            userChats={userChats.data}
        />
    )
}