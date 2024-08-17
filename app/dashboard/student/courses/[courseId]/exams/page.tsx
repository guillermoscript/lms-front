import { CheckCircleIcon, Clock } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { createClient } from '@/utils/supabase/server'

export default async function StudentExamsCoursePage ({
    params
}: {
    params: {
        courseId: string
    }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        return redirect('/auth/login')
    }
    const exams = await supabase
        .from('exams')
        .select(
            `*,
			courses(*),
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
		)`
        )
        .eq('course_id', params.courseId)
        .eq('exam_submissions.student_id', userData.data?.user?.id)
        .order('sequence')

    if (exams.error != null) {
        throw new Error(exams.error.message)
    }

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/student', label: 'Student' },
                    { href: '/dashboard/student/courses/', label: 'Courses' },
                    {
                        href: `/dashboard/student/courses/${exams.data[0].course_id}`,
                        label: exams.data[0]?.courses?.title
                    },
                    {
                        href: `/dashboard/student/courses/${exams.data[0].course_id}/exams`,
                        label: 'Exams'
                    }
                ]}
            />
            <div className="grid gap-8">
                <div>
                    <h1 className="lg:text-3xl font-bold text-xl">Exams</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {exams.data[0]?.courses?.title} {' '} Exams
                    </p>
                </div>
                <div className="grid gap-4">
                    {exams.data.map((exam) => {
                        return (
                            <ExamCard
                                number={exam.sequence}
                                statusIcon={
                                    exam.exam_submissions.length > 0 ? (
                                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <Clock className="w-5 h-5 text-gray-500" />
                                    )
                                }
                                title={exam.title}
                                description={exam.description}
                                score={
                                    exam.exam_submissions.length > 0
                                        ? exam?.exam_submissions[0]
                                            ?.exam_scores[0]?.score
                                        : 'N/A'
                                }
                                status={
                                    exam.exam_submissions.length > 0
                                        ? exam.exam_submissions[0].exam_scores
                                            .length > 0
                                            ? 'Completed'
                                            : 'Waiting for Review from Instructor'
                                        : 'Not Started'
                                }
                                actionText={
                                    exam.exam_submissions.length > 0
                                        ? 'Review'
                                        : 'Start'
                                }
                                link={
                                    exam.exam_submissions.length > 0
                                        ? `/dashboard/student/courses/${exam.course_id}/exams/${exam.exam_id}/review`
                                        : `/dashboard/student/courses/${exam.course_id}/exams/${exam.exam_id}`
                                }
                            />
                        )
                    })}
                    {/* Add more ExamCard components as needed */}
                </div>
            </div>
        </>
    )
}

const ExamCard = ({
    number,
    statusIcon,
    title,
    description,
    score,
    status,
    actionText,
    link
}: {
    number: number
    statusIcon: React.ReactNode
    title: string
    description: string
    score?: number | string
    status: string
    actionText: string
    link?: string
}) => {
    return (
        <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center flex-wrap gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{number}</span>
                    {statusIcon}
                </div>
                <div>
                    <h3 className="text-lg font-medium">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Score: {score ?? 'N/A'}
                        </span>
                    </div>
                    {status === 'Completed' ? (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-green-500">
                                {status}
                            </span>
                        </div>
                    ) : status === 'In Progress' ? (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-yellow-500">
                                {status}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-gray-500">
                                {status}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                    href={link}
                >
                    {actionText}
                </Link>
            </div>
        </div>
    )
}
