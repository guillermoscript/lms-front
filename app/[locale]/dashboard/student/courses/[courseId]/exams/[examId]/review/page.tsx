import {
    CheckCircleIcon,
    CircleIcon,
    UserIcon,
    XCircleIcon
} from 'lucide-react'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { getI18n } from '@/app/locales/server'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import AiReview from '@/components/dashboards/Common/reviews/AiReview'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'

export default async function StudentExamReviewCoursePage ({
    params
}: {
    params: {
        courseId: string
        examId: string
    }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    if (userData.error != null) {
        throw new Error(userData.error.message)
    }

    const examData = await supabase
        .from('exams')
        .select(
            `
        exam_id,
        title,
        description,
        duration,
        exam_date,
        created_by,
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
        ),
        exam_submissions (
          submission_id,
          student_id,
          submission_date,
          ai_data,
          exam_answers (
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
        `
        )
        .eq('exam_id', params.examId)
        .eq('exam_submissions.student_id', userData.data?.user?.id)
        .eq('exam_submissions.exam_id', params.examId)
        .single()
    if (examData.error != null) {
        console.log(examData.error.message)
        redirect
    }

    const teacherData = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', examData.data?.created_by)
        .single()
    const [exam_submissions] = examData?.data?.exam_submissions
    const answersByQuestionId = exam_submissions.exam_answers.reduce(
        (acc, answer) => {
            acc[answer.question_id] = answer
            return acc
        },
        {}
    )

    const score = exam_submissions?.exam_scores[0]?.score
    const aiData = exam_submissions?.ai_data as any

    console.log(aiData)

    const t = await getI18n()

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                    { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                    {
                        href: `/dashboard/student/courses/${examData?.data?.courses?.course_id}`,
                        label: examData?.data?.courses?.title,
                    },
                    {
                        href: `/dashboard/student/courses/${examData.data?.courses?.course_id}/exams`,
                        label: t('BreadcrumbComponent.exam')
                    },
                    {
                        href: `/dashboard/student/courses/${examData.data?.courses?.course_id}/exams/${examData.data?.exam_id}`,
                        label: examData.data?.title,
                    },
                    {
                        href: `/dashboard/student/courses/${examData.data?.courses?.course_id}/exams/${examData.data?.exam_id}/review`,
                        label: t('BreadcrumbComponent.review')
                    },
                ]}
            />
            <div className="space-y-8 p-6 lg:p-8 bg-gray-100 dark:bg-gray-900 rounded-lg shadow-lg">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold">
                        {examData.data?.title} {t('dashboard.student.StudentExamReviewCoursePage.review')}
                    </h1>
                    {score ? (
                        <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                            {t('dashboard.student.StudentExamReviewCoursePage.score')}:{' '}
                            <Badge className="ml-2">{score}</Badge>
                        </h3>
                    ) : (
                        <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                            {t('dashboard.student.StudentExamReviewCoursePage.status')}:{' '}
                            <Badge className="ml-2">
                                {t('dashboard.student.StudentExamReviewCoursePage.pending')}
                            </Badge>
                        </h3>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <UserIcon className="h-5 w-5 text-gray-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('dashboard.student.StudentExamReviewCoursePage.teacher')}:{' '}
                        <b>{teacherData.data?.full_name || 'Jose Martinez'}</b>
                    </p>
                </div>

                {examData.data?.exam_questions.map((question) => {
                    const answer = answersByQuestionId[question.question_id]
                    return (
                        <div
                            key={question.question_id}
                            className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md space-y-4"
                        >
                            <h2 className="text-2xl font-semibold mb-2">
                                {question.question_text}
                            </h2>
                            <div className="space-y-2">
                                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t('dashboard.student.StudentExamReviewCoursePage.yourAnswer')}:
                                </Label>
                                {question.question_type ===
                                'multiple_choice' ? (
                                        <>
                                            <div className="flex flex-col gap-2">
                                                {question.question_options.map(
                                                    (option) => {
                                                        const userAnwsers =
                                                        exam_submissions.exam_answers.filter(
                                                            (a) =>
                                                                a.question_id ===
                                                                question.question_id
                                                        )
                                                        const isChecked =
                                                        userAnwsers.some((a) =>
                                                            a.answer_text
                                                                .split(',')
                                                                .includes(
                                                                    option.option_id.toString()
                                                                )
                                                        )
                                                        const isCorrect =
                                                        option.is_correct
                                                        const backgroundColor =
                                                        isChecked
                                                            ? isCorrect
                                                                ? 'bg-green-100 dark:bg-green-800'
                                                                : 'bg-red-100 dark:bg-red-800'
                                                            : 'bg-gray-100 dark:bg-gray-800'
                                                        return (
                                                            <div
                                                                key={
                                                                    option.option_id
                                                                }
                                                                className={cn(
                                                                    'flex items-center gap-2 p-2 rounded',
                                                                    backgroundColor
                                                                )}
                                                            >
                                                                {isChecked ? (
                                                                    isCorrect ? (
                                                                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                                                    ) : (
                                                                        <XCircleIcon className="h-5 w-5 text-red-500" />
                                                                    )
                                                                ) : (
                                                                    <CircleIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                                )}
                                                                <span>
                                                                    {
                                                                        option.option_text
                                                                    }
                                                                </span>
                                                            </div>
                                                        )
                                                    }
                                                )}
                                            </div>
                                            {answer?.feedback && (
                                                <div className="mt-4">
                                                    <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {t('dashboard.student.StudentExamReviewCoursePage.feedback')}:
                                                    </Label>
                                                    <p className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                                        {answer.feedback}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                            {question.question_type === 'true_false'
                                                ? answer?.answer_text.split(
                                                    '-'
                                                )[1] === 'true'
                                                    ? t('dashboard.student.StudentExamReviewCoursePage.true')
                                                    : t('dashboard.student.StudentExamReviewCoursePage.false')
                                                : answer?.answer_text}
                                        </p>
                                    )}
                            </div>
                            {answer?.feedback && (
                                <div className="mt-4">
                                    <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {t('dashboard.student.StudentExamReviewCoursePage.feedback')}:
                                    </Label>
                                    <p className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                        {answer.feedback}
                                    </p>
                                </div>
                            )}
                        </div>
                    )
                })}

                <Suspense fallback={
                    <ChatLoadingSkeleton />
                }
                >
                    <AiReview aiData={aiData} />
                </Suspense>
            </div>
        </>
    )
}
