// @ts-nocheck

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import TeacherTestForm from '@/components/form/TeacherTestForm'
import { createClient } from '@/utils/supabase/server'

export default async function EditTestPage ({
    params
}: {
    params: { courseId: string, testId: string }
}) {
    const supabase = createClient()

    const test = await supabase
        .from('exams')
        .select(
            `* ,
            courses (*),
            exam_questions(
				*,
				question_options(*)
			)`
        )
        .eq('exam_id', params.testId)
        .single()

    if (test.error != null) {
        console.log(test.error.message)
    }

    console.log(test.data)

    console.log(test.data?.exam_questions)
    const fieldsForQuestions = test.data?.exam_questions?.map((question) => {
        return {
            type: question.question_type,
            label: question.question_text,
            options: question.question_options,
            required: false,
            questionId: question.question_id
        }
    })

    console.log(fieldsForQuestions)

    return (
        <div className="flex-1 p-8 overflow-y-auto w-full space-y-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/teacher', label: 'Teacher' },
                    { href: '/dashboard/teacher/courses', label: 'Courses' },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}`,
                        label: test?.data?.courses?.title
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests`,
                        label: 'Tests'
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}`,
                        label: test?.data?.title
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/edit`,
                        label: 'Edit'
                    }
                ]}
            />

            <div className="flex justify-between items-center w-full">
                <TeacherTestForm
                    testId={params.testId}
                    defaultValues={{
                        testName: test?.data?.title,
                        testDescription: test?.data?.description,
                        course: test?.data?.course_id,
                        // retakeInterval: test?.data?.duration,
                        duration: test?.data?.duration,
                        exam_date: test?.data?.exam_date,
                        sequence: test?.data?.sequence,
                        questions: fieldsForQuestions
                    }}
                />
            </div>
        </div>
    )
}
