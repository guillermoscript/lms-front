import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function CourseStudentPage ({
    params
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        return redirect('/auth/login')
    }

    const courseData = await supabase
        .from('courses')
        .select(
            `*,
		lessons(*, lesson_completions(*)),
		exams(*,
			exam_submissions(
				submission_id,
				student_id,
				submission_date,
				exam_answers(
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
		)
	`
        )
        .eq('course_id', params.courseId)
        .eq('status', 'published')
        // .eq('lessons.status', 'published')
        // .eq('exams.status', 'published')
        .eq('lessons.lesson_completions.user_id', userData.data.user.id)
        .eq('exams.exam_submissions.student_id', userData.data.user.id)
        .single()

    if (courseData.error != null) {
        throw new Error(courseData.error.message)
    }

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
                            href={`/dashboard/student/courses/${courseData.data.course_id}`}
                        >
                            {courseData.data.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-1">
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>{courseData.data.title}</CardTitle>
                        {courseData.data.description && (
                            <CardDescription>
                                {courseData.data.description}
                            </CardDescription>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div>
                                <h3 className="text-xl font-bold mb-4">
                                    Course Overview
                                </h3>
                                <img
                                    src={courseData.data.thumbnail_url}
                                    alt="Course Image"
                                    className="rounded-md object-cover"
                                />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold mb-4">
                                  Lessons
                                </h3>
                                <div className="grid gap-4">
                                    {courseData.data.lessons
                                        .sort(
                                            (a, b) => a?.sequence - b?.sequence
                                        )
                                        .map((lesson) => (
                                            <LessonCard
                                                title={lesson.title}
                                                lessonNumber={lesson.sequence}
                                                description={lesson.description}
                                                status={lesson.lesson_completions.length > 0
                                                    ? 'default'
                                                    : 'outline'}
                                                courseId={
                                                    courseData.data.course_id
                                                }
                                                lessonId={lesson.id}
                                            />
                                        ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold mb-4">
                                  Exams
                                </h3>
                                <div className="grid gap-4">
                                    {courseData.data.exams
                                        .sort(
                                            (a, b) => a?.sequence - b?.sequence
                                        )
                                        .map((exam) => (
                                            <ExamCard
                                                title={exam.title}
                                                examNumber={exam.sequence}
                                                description={exam.description}
                                                status={ exam.exam_submissions.length > 0
                                                    ? exam.exam_submissions[0].exam_scores
                                                        .length > 0
                                                        ? 'default'
                                                        : 'secondary'
                                                    : 'outline'}
                                                grade={exam.exam_submissions.length > 0
                                                    ? exam?.exam_submissions[0]
                                                        ?.exam_scores[0]?.score
                                                    : 'N/A'}
                                                courseId={
                                                    courseData.data.course_id
                                                }
                                                examId={exam.exam_id}
                                            />
                                        ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

const CourseStats = ({ title, value }: { title: string, value: string }) => (
    <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-gray-500 dark:text-gray-400">{title}</p>
    </div>
)

const LessonCard = ({
    title,
    lessonNumber,
    description,
    status,
    courseId,
    lessonId
}: {
    title: string
    lessonNumber: number
    description: string
    status: 'default' | 'destructive' | 'outline' | 'secondary'
    courseId: number
    lessonId: number
}) => (
    <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
            <div>
                <h4 className="text-lg font-bold">{title}</h4>
                <p className="text-gray-500 dark:text-gray-400">
                    Lesson {lessonNumber}
                </p>
            </div>
            <div>
                <Badge variant={status}>
                    {status === 'default' ? 'Completed' : 'Incomplete'}
                </Badge>
            </div>
        </div>
        <div className="mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                {description}
            </p>
            <div className="mt-2">
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}
                >
                    View Lesson
                </Link>
            </div>
        </div>
    </div>
)

const ExamCard = ({
    title,
    examNumber,
    description,
    status,
    grade,
    courseId,
    examId
}: {
    title: string
    examNumber: number
    description: string
    status: 'default' | 'destructive' | 'outline' | 'secondary'
    grade: number | string
    courseId: number
    examId: number
}) => (
    <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
            <div>
                <h4 className="text-lg font-bold">{title}</h4>
                <p className="text-gray-500 dark:text-gray-400">
                    Exam {examNumber}
                </p>
            </div>
            <div>
                <Badge variant={status}>
                    {status === 'default' ? 'Completed' : 'Incomplete'}
                </Badge>
            </div>
        </div>
        <div className="mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                {description}
            </p>
            <div className="mt-2">
                <div className="flex items-center justify-between">
                    <p>Grade: {grade}</p>
                    <Link
                        className={buttonVariants({ variant: 'link' })}
                        href={`/dashboard/student/courses/${courseId}/exams/${examId}`}
                    >
                        View Exam
                    </Link>
                </div>
            </div>
        </div>
    </div>
)
