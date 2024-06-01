import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'
import { Calculator, CheckCircleIcon, CircleIcon, ClockIcon, UserIcon, XCircleIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

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
    return redirect('/auth/login')
  }

  const examData = await supabase
    .from('exams')
    .select(`
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
            ),
            exam_submissions (
                submission_id,
                student_id,
                submission_date,
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
        `)
    .eq('exam_id', params.examId)
    .eq('exam_submissions.student_id', userData.data?.user?.id)
    .eq('exam_submissions.exam_id', params.examId)
    .single()

  console.log(examData.data)

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
            <BreadcrumbLink href="/dashboard/student">
              Student
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/student/courses">
              Courses
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/student/courses/${examData?.data?.courses?.course_id}`}
            >
              {examData?.data?.courses?.title}
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/student/courses/${examData.data?.courses?.course_id}/exams`}
            >
              Exams
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/student/courses/${examData.data?.courses?.course_id}/exams/${examData.data?.exam_id}`}
            >
              {examData.data?.title}
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/student/courses/${examData.data?.courses?.course_id}/exams/${examData.data?.exam_id}/review`}
            >
              Review
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {examData.data?.title} Review
          </h1>

          <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
            Score:
            <Badge className="ml-2 ">
              {score}
            </Badge>
          </h3>

        </div>
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-gray-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Teacher: {examData.data?.courses?.teacher}
          </p>
        </div>

        {examData.data?.exam_questions.map((question) => {
				  const answer = answersByQuestionId[question.question_id]

          console.log(answer)
				  return (
  <div
    key={question.question_id}
    className="bg-white rounded-lg shadow-md p-6 dark:bg-gray-950"
  >
    <h2 className="text-2xl font-bold mb-4">
      {question.question_text}
    </h2>

    <div className="mt-2">
      <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Your Answer:
      </Label>

      {question.question_type ===
								'multiple_choice'
        ? (
          <>
            <div className="mb-4 p-2 rounded">
              {question.question_options.map(
											  (option) => {
											    const userAnwsers = exam_submissions.exam_answers.filter(
											      (a) =>
											        a.question_id ===
                                                            question.question_id
											    )

											    const isChecked = userAnwsers.some(
											      (a) =>
											        a.answer_text
											          .split(',')
											          .includes(
											            option.option_id.toString()
											          )
											    )

											    const isCorrect = option.is_correct

                  const backgroundColor = isChecked
											      ? isCorrect
											        ? 'bg-green-100 dark:bg-green-800'
											        : 'bg-red-100 dark:bg-red-800'
											      : 'bg-gray-100 dark:bg-gray-800'

											    return (
  <div
    key={option.option_id}
    className={cn(
      'flex items-center gap-2 p-2 rounded',
      backgroundColor
    )}
  >
    {
                                                                isChecked
                                                                  ? (
                                                                      isCorrect
                                                                        ? (
                                                                          <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                                                          )
                                                                        : (
                                                                          <XCircleIcon className="h-5 w-5 text-red-500" />
                                                                          )
                                                                    )
                                                                  : (
                                                                    <CircleIcon className="h-5 w-5 text-gray-500" />
                                                                    )
                                                            }

    <span>
      {option.option_text}
    </span>
  </div>
											    )
											  }
              )}
            </div>
            {answer?.feedback && (
            <div className="mt-4">
              <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Feedback:
              </Label>

              <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
                {answer.feedback}
              </p>
            </div>
            )}
          </>
								    )
        : (
          <p className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
            {
                                            question.question_type === 'true_false'
                                              ? (
                                                  answer?.answer_text.split('-')[1] === 'true' ? 'True' : 'False'
                                                )
                                              : answer?.answer_text
                                        }
          </p>
								    )}
    </div>

    {answer?.feedback && (
    <div className="mt-4">
      <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Feedback:
      </Label>

      <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
        {answer.feedback}
      </p>
    </div>
    )}
  </div>
				  )
        })}
      </div>
    </>
  )
}
