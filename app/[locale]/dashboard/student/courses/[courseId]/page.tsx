import type { Metadata, ResolvingMetadata } from 'next'
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import EnhancedCourseStudentPage from '@/components/dashboards/student/course/EnhancedCourseStudentPage'
import { createClient } from '@/utils/supabase/server'

interface Props {
    params: { courseId: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const supabase = createClient()

    const courseData = await supabase
        .from('courses')
        .select('title, description, thumbnail_url')
        .eq('course_id', params.courseId)
        .single()

    const course = courseData.data

    const previousImages = (await parent).openGraph?.images || []

    return {
        title: course?.title || 'Course Student Page',
        description: course?.description || 'Course Student Page',
        openGraph: {
            images: [course?.thumbnail_url || '/img/robot.jpeg', ...previousImages],
        },
    }
}

export default async function CourseStudentPage({
    params,
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    const t = await getI18n()

    if (userData.error != null) {
        return redirect('/auth/login')
    }

    const courseData = await supabase
        .from('courses')
        .select(
            `*,
        lessons(title, description, image, sequence, id, lesson_completions(id), lessons_ai_task_messages(id)),
        exams(*,
            exam_submissions(
                submission_id,
                student_id,
                submission_date,
                exam_answers(
                    answer_id,
                    question_id,
                    answer_text,
                    is_correct,
                    feedback
                ),
                exam_scores (
                    score_id,
                    score
                )
            )
        ),
        exercises(*,
            exercise_completions(id),
            exercise_messages(id)
        )
    `
        )
        .eq('course_id', params.courseId)
        .eq('status', 'published')
        .eq('lessons.lesson_completions.user_id', userData.data.user.id)
        .eq('exams.exam_submissions.student_id', userData.data.user.id)
        .eq('exercises.exercise_completions.user_id', userData.data.user.id)
        .eq('exercises.exercise_messages.user_id', userData.data.user.id)
        .eq('lessons.lessons_ai_task_messages.user_id', userData.data.user.id)
        .single()

    if (courseData.error != null) {
        throw new Error(courseData.error.message)
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className='pb-6'>
                <BreadcrumbComponent
                    links={[
                        { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                        { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                        { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                        {
                            href: `/dashboard/student/courses/${courseData.data.course_id}`,
                            label: courseData.data.title,
                        },
                    ]}
                />
            </div>
            <EnhancedCourseStudentPage courseData={courseData.data as any} />
        </div>
    )
}
