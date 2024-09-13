import { redirect } from 'next/navigation'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExamsSubmissionForm from '@/components/dashboards/student/ExamSubmissionForm'
import { createClient } from '@/utils/supabase/server'
import { getI18n } from '@/app/locales/server'

export default async function StudentExamCoursePage ({
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
        redirect('/auth/login')
    }

    const exams = await supabase
        .from('exams')
        .select(
            `* ,
            courses (*),
            exam_questions(
				*,
				question_options(*)
			)
		`
        )
        .eq('exam_id', params.examId)
        .single()

    const examSubmission = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('exam_id', params.examId)
        .eq('student_id', userData.data?.user?.id)
        .single()

    console.log(examSubmission)

    if (examSubmission.error != null) {
        console.log(examSubmission.error.message)
    }

    if (examSubmission.data?.exam_id) {
        redirect(
            `/dashboard/student/courses/${params.courseId}/exams/${params.examId}/review`
        )
    }

    if (exams.error != null) {
        console.log(exams.error.message)
    }

    const {
        singleSelectQuestions,
        freeTextQuestions,
        multipleChoiceQuestions
    } = parseExamData(exams.data)

    const t = await getI18n()

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                    { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                    {
                        href: `/dashboard/student/courses/${exams.data?.course_id}`,
                        label: exams.data?.courses?.title
                    },
                    {
                        href: `/dashboard/student/courses/${exams.data?.course_id}/exams`,
                        label: t('BreadcrumbComponent.exam')
                    },
                    {
                        href: `/dashboard/student/courses/${exams.data?.course_id}/exams/${exams.data?.exam_id}`,
                        label: exams.data?.title
                    }
                ]}
            />
            <div className="grid gap-8 container">
                <div>
                    <h1 className="text-3xl font-bold">
                        {exams.data.title}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {exams.data.description}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                        {t('dashboard.student.StudentExamCoursePage.duration')}: {exams.data?.duration} minutes
                    </p>
                </div>
                <ExamsSubmissionForm
                    multipleChoiceQuestions={multipleChoiceQuestions}
                    freeTextQuestions={freeTextQuestions}
                    singleSelectQuestions={singleSelectQuestions}
                    examId={parseFloat(params.examId)}
                    courseId={parseFloat(params.courseId)}
                />
            </div>
        </>
    )
}

const parseExamData = (examData: any) => {
    const { exam_questions } = examData

    const freeTextQuestions = exam_questions
        .filter((q) => q.question_type === 'free_text')
        .map((q) => ({
            id: q.question_id.toString(),

            label: q.question_text,

            placeholder: 'Enter your answer'
        }))

    const singleSelectQuestions = exam_questions
        .filter((q) => q.question_type === 'true_false')
        .map((q) => ({
            id: q.question_id.toString(),

            text: q.question_text
        }))

    const multipleChoiceQuestions = exam_questions
        .filter((q) => q.question_type === 'multiple_choice')
        .map((q) => ({
            id: q.question_id.toString(),

            label: q.question_text,

            options: q.question_options.map((option) => ({
                id: option.option_id.toString(),

                text: option.option_text
            }))
        }))

    return {
        freeTextQuestions,
        singleSelectQuestions,
        multipleChoiceQuestions
    }
}
