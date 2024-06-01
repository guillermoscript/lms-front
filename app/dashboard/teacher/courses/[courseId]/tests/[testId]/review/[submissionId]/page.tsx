import TestSubmissionReview from '@/components/dashboard/teacher/test/TestSubmissionReview'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { createClient } from '@/utils/supabase/server'
import { ClockIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

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

    .select(`
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
        `)
    .eq('exam_id', params.testId)
    .eq('submission_id', params.submissionId)
    .single()

  if (examError != null) {
    console.log(examError.message)
    return redirect('/dashboard/student/courses')
  }

  console.log(examData)

  const { exams } = examData
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
            <BreadcrumbLink href="/dashboard/teacher">
              Teacher
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}`}
            >
              Courses
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}/tests`}
            >
              Exams
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}`}
            >
              {exams?.title}
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/review/${params.submissionId}`}
            >
              Review
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8">
        <div className="bg-white rounded-lg shadow-md p-6 dark:bg-gray-950">
          <h1 className="text-3xl font-bold">
            {exams?.title} Exam Review
          </h1>

          <p className="text-gray-500 dark:text-gray-400">
            {exams?.description}
          </p>

          <div className="mt-4 flex items-center gap-4">
            <ClockIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />

            <span className="text-sm text-gray-500 dark:text-gray-400">
              Duration: {exams?.duration} minutes
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
