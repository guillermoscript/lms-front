// @ts-nocheck
import dayjs from 'dayjs'
import Link from 'next/link'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { FreeTextQuestionRead } from '@/components/dashboards/teacher/test/FreeTextQuestion'
import { MultipleChoiceQuestionRead } from '@/components/dashboards/teacher/test/MultipleChoiceQuestion'
import { SingleSelectQuestionRead } from '@/components/dashboards/teacher/test/SingleSelectQuestion'
import categorizeQuestions from '@/components/dashboards/teacher/test/utils/categorizeQuestions'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DataTable } from '@/components/ui/Table/data-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

import { testSubmissionsCols } from './testSubmissionsCols'

export default async function LessonPage({
    params
}: {
    params: { courseId: string, testId: string }
}) {
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    const test = await supabase
        .from('exams')
        .select(
            `* ,
            courses (*),
            exam_questions(
				*,
				question_options(*)
			),
			exam_submissions (
                submission_id,
                student_id,
                submission_date,
                exam_scores (
                    score_id,
                    score
                )
            )
		`
        )
        .eq('exam_id', params.testId)
        .single()

    const subData = await supabase
        .rpc('get_exam_submissions', {
            p_exam_id: params.testId
        })

    const {
        multipleChoiceQuestions,
        freeTextQuestions,
        singleSelectQuestions
    } = categorizeQuestions(test.data?.exam_questions)

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
                        href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}`,
                        label: test?.data?.title
                    },
                    { href: `/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/edit`, label: 'Edit' }
                ]}
            />
            <Tabs defaultValue="examData" className="w-full">
                <TabsList>
                    <TabsTrigger value="examData">Exam Data</TabsTrigger>
                    <TabsTrigger value="examSubmissions">
                        Exam Submissions
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="examData">
                    <>
                        <div className="flex justify-between items-center w-full">
                            <h1 className="text-2xl font-semibold mb-4">
                                Test: {test?.data?.title}
                            </h1>
                            <Link
                                href={`/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/edit`}
                                className={buttonVariants({ variant: 'link' })}
                            >
                                Edit
                            </Link>
                        </div>

                        <h3 className="text-lg font-semibold mt-4">
                            Status: {test?.data?.status}
                        </h3>
                        <h3 className="text-lg font-semibold mt-4">
                            Sequence: {test?.data?.sequence}
                        </h3>
                        <div className="space-y-4">
                            <>
                                {singleSelectQuestions.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold">
                                            True or False
                                        </h3>
                                        <SingleSelectQuestionRead
                                            questions={singleSelectQuestions}
                                        />
                                    </div>
                                )}
                                <Separator className="my-4" />
                                {freeTextQuestions.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold">
                                            Fill in the Blank
                                        </h3>
                                        <FreeTextQuestionRead
                                            questions={freeTextQuestions}
                                        />
                                    </div>
                                )}
                                <Separator className="my-4" />
                                {multipleChoiceQuestions.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold">
                                            Multiple Choice
                                        </h3>
                                        <MultipleChoiceQuestionRead
                                            questions={multipleChoiceQuestions}
                                        />
                                    </div>
                                )}
                            </>
                        </div>
                    </>
                </TabsContent>
                <TabsContent value="examSubmissions">
                    <DataTable
                        columns={testSubmissionsCols}
                        data={subData.data.map((sub) => {
                            return {
                                submission_id: sub.submission_id,
                                exam_id: sub.exam_id,
                                exam_title: sub.exam_title,
                                student_id: sub.student_id,
                                submission_date: dayjs(sub.submission_date).format('DD/MM/YYYY'),
                                score: sub.exam_scores,
                                feedback: sub.feedback,
                                evaluated_at: sub.evaluated_at ? dayjs(sub.evaluated_at).format('DD/MM/YYYY') : null,
                                is_reviewed: sub.is_reviewed,
                                full_name: sub.full_name,
                                courseId: params.courseId
                            }
                        })}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
