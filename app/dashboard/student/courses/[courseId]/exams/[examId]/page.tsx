import { ClockIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

import ExamsSubmissionForm from '@/components/dashboard/student/ExamSubmissionForm'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { createClient } from '@/utils/supabase/server'

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

    return (
        <>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">
                          Dashboard
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href="/dashboard/student"
                        >
                            Student
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href="/dashboard/student/courses"
                        >
                            Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${exams?.data?.course_id}`}
                        >
                            {exams.data?.courses?.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${exams?.data?.course_id}/exams`}
                        >
                            Exams
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${exams?.data?.course_id}/exams/${exams?.data?.exam_id}`}
                        >
                            {exams?.data?.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="grid gap-8">
                <div>
                    <h1 className="text-3xl font-bold">
                        CSS Fundamentals Exam
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Test your understanding of CSS basics. You have 45
                        minutes to complete the exam.
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                        Exam duration: {exams.data?.duration} minutes
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                        <ClockIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Time remaining: 42 minutes
                        </span>
                    </div>
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
