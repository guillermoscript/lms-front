import type { Metadata, ResolvingMetadata } from 'next'

import { getScopedI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import CourseDashboard from '@/components/dashboards/student/course/CourseDashboard'
import { createClient } from '@/utils/supabase/server'

export async function generateMetadata(
    _props: any,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const subscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)

    const coursesQuery =
        subscriptions.data.length > 0
            ? supabase
                .from('courses')
                .select('title, thumbnail_url')
                .eq('status', 'published')
                .eq('enrollments.user_id', user.data.user.id)
            : supabase
                .from('enrollments')
                .select('course:course_id(title, thumbnail_url)')
                .eq('user_id', user.data.user.id)

    const coursesResult = await coursesQuery

    const course = (coursesResult.data[0] as any)?.course || coursesResult.data[0]

    const previousImages = (await parent).openGraph?.images || []

    return {
        title: 'Student Courses',
        description: 'Dashboard for student courses',
        openGraph: {
            images: [course?.thumbnail_url || '/img/robot.jpeg', ...previousImages],
        },
    }
}

export default async function CourseSectionComponent() {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    const t = await getScopedI18n('BreadcrumbComponent')

    const subscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)

    const coursesQuery =
        subscriptions.data.length > 0
            ? supabase
                .from('courses')
                .select(
                    `
                course_id,
            title,
            description,
            enrollments(user_id),
            thumbnail_url,
            lessons(id, lesson_completions(*)),
            exams(exam_id),
            exercises(id, exercise_completions(id))
            `
                )
                .eq('status', 'published')
                .eq('lessons.lesson_completions.user_id', user.data.user.id)
                .eq('enrollments.user_id', user.data.user.id)
                .eq('exercises.exercise_completions.user_id', user.data.user.id)
            : supabase
                .from('enrollments')
                .select(
                    `
                course:course_id(
                course_id,
                title,
                description,
                thumbnail_url,
                lessons(id, lesson_completions(*)),
                exams(exam_id),
                exercises(id, exercise_completions(id))
            )
            `
                )
                .eq('user_id', user.data.user.id)
                .eq('course.lessons.lesson_completions.user_id', user.data.user.id)
                .eq('exercises.exercise_completions.user_id', user.data.user.id)

    const coursesResult = await coursesQuery

    if (coursesResult.error) throw new Error(coursesResult.error.message)
    const courses = coursesResult.data.map((course) => {
        return {
            course: {
                course_id: course.course_id,
                title: course.title,
                description: course.description,
                thumbnail_url: course.thumbnail_url,
                lessons: course.lessons,
                exams: course.exams,
                enrolled: subscriptions.data.length > 0 ? course.enrollments.length > 0 : true,
                exercises: course.exercises,
            },
        }
    })

    return (
        <>
            <div className="container mx-auto pt-8">
                <BreadcrumbComponent
                    links={[
                        { href: '/dashboard', label: t('dashboard') },
                        { href: '/dashboard/student', label: t('student') },
                        {
                            href: '/dashboard/student/courses/',
                            label: t('course'),
                        },
                    ]}
                />
            </div>
            <CourseDashboard userCourses={courses} />
        </>
    )
}
