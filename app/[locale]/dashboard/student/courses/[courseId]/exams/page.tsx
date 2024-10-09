import { AlertCircle, BookOpen, CheckCircleIcon, Clock } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/utils/supabase/server'

export default async function StudentExamsCoursePage({
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

    const t = await getI18n()

    const completedExams = exams.data.filter(exam => exam.exam_submissions.length > 0 && exam.exam_submissions[0].exam_scores.length > 0).length
    const totalExams = exams.data.length

    return (
        <div className="container mx-auto px-4 py-8">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                    { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                    {
                        href: `/dashboard/student/courses/${exams.data[0].course_id}`,
                        label: exams.data[0]?.courses?.title
                    },
                    {
                        href: `/dashboard/student/courses/${exams.data[0].course_id}/exams`,
                        label: t('BreadcrumbComponent.exam')
                    }
                ]}
            />
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{t('BreadcrumbComponent.exam')}</h1>
                        <p className="text-xl text-muted-foreground">{exams.data[0]?.courses?.title}</p>
                    </div>
                    <Card className="w-full md:w-auto">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-4">
                                    <span className="text-sm font-medium">
                                        {t('dashboard.student.StudentExamsCoursePage.completedExams')}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold">{completedExams}/{totalExams}</span>
                                        <BookOpen className="h-8 w-8 text-primary" />
                                    </div>
                                </div>
                            </div>
                            <Progress value={(completedExams / totalExams) * 100} className="mt-2" />
                        </CardContent>
                    </Card>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {exams.data.map((exam) => (
                        <ExamCard
                            t={t}
                            key={exam.exam_id}
                            number={exam.sequence}
                            statusIcon={
                                exam.exam_submissions.length > 0 ? (
                                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                ) : (
                                    <Clock className="w-5 h-5 text-yellow-500" />
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
                                        ? t('dashboard.student.StudentExamsCoursePage.completed')
                                        : t('dashboard.student.StudentExamsCoursePage.waitingReview')
                                    : t('dashboard.student.StudentExamsCoursePage.notStarted')
                            }
                            actionText={
                                exam.exam_submissions.length > 0
                                    ? t('dashboard.student.StudentExamsCoursePage.review')
                                    : t('dashboard.student.StudentExamsCoursePage.start')
                            }
                            link={
                                exam.exam_submissions.length > 0
                                    ? `/dashboard/student/courses/${exam.course_id}/exams/${exam.exam_id}/review`
                                    : `/dashboard/student/courses/${exam.course_id}/exams/${exam.exam_id}`
                            }
                        />
                    ))}
                </div>
            </div>
        </div>
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
    link,
    t
}: {
    number: number
    statusIcon: React.ReactNode
    title: string
    description: string
    score?: number | string
    status: string
    actionText: string
    link?: string
    t: any
}) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Completed':
                return 'bg-green-100 text-green-800'
            case 'Waiting for Review':
                return 'bg-yellow-100 text-yellow-800'
            default:
                return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>
                        {t('dashboard.student.StudentExamsCoursePage.exam')} {number}
                    </span>
                    {statusIcon}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{description}</p>
                <div className="flex items-center justify-between mb-4">
                    <Badge variant="outline" className={getStatusColor(status)}>
                        {status}
                    </Badge>
                    <div className="flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1 text-muted-foreground" />
                        <span className="text-sm font-medium">Score: {score}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button asChild className="w-full">
                    <Link href={link}>
                        {actionText}
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}
