
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExamReview from '@/components/dashboards/student/course/exams/enhanced-exam-review'
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

    const t = await getI18n()

    return (
        <>
            <div className='container'>
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
            </div>
            <ExamReview
                examData={examData.data}
                aiData={aiData}
                examIsReviewed={score != null}
            />
        </>
    )
}
