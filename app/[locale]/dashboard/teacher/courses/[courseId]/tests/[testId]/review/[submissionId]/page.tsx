// @ts-nocheck
import { ClockIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import TestSubmissionReview from '@/components/dashboards/teacher/test/TestSubmissionReview'
import { createClient } from '@/utils/supabase/server'

export default async function ReviewStudentExamSubmission ({
    params
}: {
    params: {
        courseId: string

        testId: string

        submissionId: string
    }
}) {
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        return redirect('/auth/login')
    }

    const { data: examData, error: examError } = await supabase

        .from('exam_submissions')

        .select(
            `
            submission_id,
            student_id,
            submission_date,
            exam_answers (
                *
            ),
            exam_scores (
                score_id,
                score
            ),
            exams (
                exam_id,
                title,
                description,
                duration,
                exam_date,
                courses (
                    title,
                    course_id
                ),
                exam_questions (
                    question_id,
                    question_text,
                    question_type,
                    question_options (
                        option_id,
                        is_correct,
                        option_text
                    )
                )
            )
        `
        )
        .eq('exam_id', params.testId)
        .eq('submission_id', params.submissionId)
        .single()

    if (examError != null) {
        console.log(examError.message)
        return redirect('/dashboard/student/courses')
    }

    console.log(examData)

    const { exams } = examData

    const t = await getI18n()

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}`,
                        label: exams?.courses?.title
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests`,
                        label: t('BreadcrumbComponent.exam')
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}`,
                        label: exams?.title
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/review/${params.submissionId}`,
                        label: t('BreadcrumbComponent.review')
                    }
                ]}
            />

            <div className="grid gap-8">
                <div className="bg-white rounded-lg shadow-md p-6 dark:bg-gray-950">
                    <h1 className="text-3xl font-bold">
                        {exams?.title} {t('dashboard.teacher.ReviewStudentExamSubmission.title')}
                    </h1>

                    <p className="text-gray-500 dark:text-gray-400">
                        {exams?.description}
                    </p>

                    <div className="mt-4 flex items-center gap-4">
                        <ClockIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />

                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {t('dashboard.teacher.ReviewStudentExamSubmission.duration')} {exams?.duration} {t('dashboard.teacher.ReviewStudentExamSubmission.minutes')}
                        </span>
                    </div>
                </div>

                <TestSubmissionReview
                    exam_answers={examData.exam_answers}
                    exams={exams}
                    submissionId={params.submissionId}
                    studentId={examData.student_id}
                />
            </div>
        </>
    )
}
