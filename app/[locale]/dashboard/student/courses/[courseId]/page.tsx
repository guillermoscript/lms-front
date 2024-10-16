import { CheckCircle, Clock, Clock10, Dumbbell, FileText } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'

const ExerciseCard = ({ title, description, difficulty, type, status, courseId, exerciseId, t }) => (
    <Card className="mb-4">
        <CardHeader>
            <CardTitle className="flex items-center justify-between">
                <span>{title}</span>
                <Badge variant={status === 'Completed' ? 'default' : status === 'In Progress' ? 'outline' : 'secondary'}>
                    {status === 'Completed' ? <CheckCircle className="mr-1 h-3 w-3" /> : status === 'In Progress' ? <Clock className="mr-1 h-3 w-3" /> : <Clock10 className="mr-1 h-3 w-3" />}
                    {status === 'Completed' ? t('dashboard.student.CourseStudentPage.completed') : status === 'In Progress' ? t('dashboard.student.CourseStudentPage.inProgress') : t('dashboard.student.CourseStudentPage.notStarted')}
                </Badge>
            </CardTitle>
            <CardDescription>{type} - {difficulty}</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{description}</p>
        </CardContent>
        <CardFooter>
            <Button
                variant={status === 'Completed' ? 'secondary' : status === 'In Progress' ? 'default' : 'outline'}
                asChild
                className='w-full'
            >
                <Link href={`/dashboard/student/courses/${courseId}/exercises/${exerciseId}`}>
                    <Dumbbell className="mr-2 h-4 w-4" />
                    {
                        status === 'Completed' ? t('dashboard.student.CourseStudentPage.review') : status === 'In Progress' ? t('dashboard.student.CourseStudentPage.continue') : t('dashboard.student.CourseStudentPage.start')
                    }
                </Link>
            </Button>
        </CardFooter>
    </Card>
)

const CourseHeader = ({ title, description, image }) => (
    <div className="relative h-64 md:h-80 mb-8 rounded-lg overflow-hidden">
        <Image
            src={image}
            alt={title}
            layout="fill"
            objectFit="cover"
            className="brightness-50"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/80 to-transparent">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{title}</h1>
            <p className="text-lg text-gray-200">{description}</p>
        </div>
    </div>
)

const ProgressCard = ({
    completedLessons, totalLessons, completedExams, totalExams, t,
    completedExercises, totalExercises
}) => (
    <Card className="mb-8">
        <CardHeader>
            <CardTitle>{t('dashboard.student.CourseStudentPage.progressTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{t('dashboard.student.CourseStudentPage.lessonsCompleted')}</span>
                        <span className="text-sm font-medium">{completedLessons}/{totalLessons}</span>
                    </div>
                    <Progress value={(completedLessons / totalLessons) * 100} className="h-2" />
                </div>
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{t('dashboard.student.CourseStudentPage.examsCompleted')}</span>
                        <span className="text-sm font-medium">{completedExams}/{totalExams}</span>
                    </div>
                    <Progress value={(completedExams / totalExams) * 100} className="h-2" />
                </div>
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{t('dashboard.student.CourseStudentPage.exercisesCompleted')}</span>
                        <span className="text-sm font-medium">{completedExercises}/{totalExercises}</span>
                    </div>
                    <Progress value={(completedExercises / totalExercises) * 100} className="h-2" />
                </div>
            </div>
        </CardContent>
    </Card>
)

const LessonCard = ({
    title,
    number,
    description,
    status,
    courseId,
    lessonId,
    image,
    t
}) => (
    <Card className="overflow-hidden">
        <div className="relative h-48">
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}>
                <Image
                    src={image || '/icons/placeholder.svg'}
                    alt={title}
                    layout="fill"
                    objectFit="cover"
                />
            </Link>
            <div className="absolute top-2 left-2 bg-white dark:bg-gray-800 rounded-full px-2 py-1 text-sm font-semibold">
                {t('dashboard.student.CourseStudentPage.lesson')} {number}
            </div>
        </div>
        <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{description}</p>
            <Badge
                variant={status === 'Completed' ? 'default' : status === 'In Progress' ? 'outline' : 'secondary'}
                className="mb-2"
            >
                {status === 'Completed' ? (
                    <><CheckCircle className="mr-1 h-3 w-3" /> {t('dashboard.student.CourseStudentPage.completed')}</>
                ) : status === 'In Progress' ? (
                    <><Clock className="mr-1 h-3 w-3" /> {t('dashboard.student.CourseStudentPage.inProgress')}</>
                ) : (
                    <><Clock10 className="mr-1 h-3 w-3" /> {t('dashboard.student.CourseStudentPage.notStarted')}</>
                )}
            </Badge>
        </CardContent>
        <CardFooter className="p-4 pt-0">
            <Button
                variant={status === 'Completed' ? 'secondary' : status === 'In Progress' ? 'default' : 'outline'}
                asChild className="w-full"
            >
                <Link href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}>
                    {status === 'Completed' ? t('dashboard.student.CourseStudentPage.review') : status === 'In Progress' ? t('dashboard.student.CourseStudentPage.continue') : t('dashboard.student.CourseStudentPage.start')}
                </Link>
            </Button>
        </CardFooter>
    </Card>
)

const ExamCard = ({ title, number, description, status, grade, courseId, examId, t }) => (
    <Card className="mb-4">
        <CardHeader>
            <CardTitle className="flex items-center justify-between">
                <span>{title}</span>
                <Badge variant={status === 'Completed' ? 'default' : status === 'Not Started' ? 'outline' : 'secondary'}>
                    {status === 'Completed' ? <CheckCircle className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                    {status === 'Completed' ? t('dashboard.student.CourseStudentPage.completed') : status === 'Not Started' ? t('dashboard.student.CourseStudentPage.notStarted') : t('dashboard.student.CourseStudentPage.waitingForReview')}
                </Badge>
            </CardTitle>
            <CardDescription>{t('dashboard.student.CourseStudentPage.exam')} {number}</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{description}</p>
            {grade && <p className="font-semibold">{t('dashboard.student.CourseStudentPage.grade')}: {grade}</p>}
        </CardContent>
        <CardFooter>
            <Button
                variant={status === 'Completed' ? 'secondary' : 'default'}
                className='w-full'
                asChild
            >
                <Link href={`/dashboard/student/courses/${courseId}/exams/${examId}`}>
                    <FileText className="mr-2 h-4 w-4" /> {t('dashboard.student.CourseStudentPage.viewExam')}
                </Link>
            </Button>
        </CardFooter>
    </Card>
)

export default async function CourseStudentPage({
    params,
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    const t = await getI18n()

    if (userData.error != null) {
        return redirect('/auth/login')
    }

    const courseData = await supabase
        .from('courses')
        .select(
            `*,
        lessons(title, description, image, sequence, id, lesson_completions(*), lessons_ai_task_messages(*)),
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
        ),
        exercises(*,
            exercise_completions(id),
            exercise_messages(id)
        )
    `
        )
        .eq('course_id', params.courseId)
        .eq('status', 'published')
        .eq('lessons.lesson_completions.user_id', userData.data.user.id)
        .eq('exams.exam_submissions.student_id', userData.data.user.id)
        .eq('exercises.exercise_completions.user_id', userData.data.user.id)
        .eq('exercises.exercise_messages.user_id', userData.data.user.id)
        .eq('lessons.lessons_ai_task_messages.user_id', userData.data.user.id)
        .single()

    if (courseData.error != null) {
        throw new Error(courseData.error.message)
    }

    const completedLessons = courseData.data.lessons.filter(lesson => lesson.lesson_completions.length > 0).length
    const completedExams = courseData.data.exams.filter(exam => exam.exam_submissions.length > 0).length
    const completedExercises = courseData.data.exercises.filter(exercise => exercise.exercise_completions?.length > 0).length

    return (
        <div className="container mx-auto px-4 py-8">
            <div
                className='pb-6'
            >
                <BreadcrumbComponent
                    links={[
                        { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                        { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                        { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                        {
                            href: `/dashboard/student/courses/${courseData.data.course_id}`,
                            label: courseData.data.title,
                        },
                    ]}
                />
            </div>
            <CourseHeader
                title={courseData.data.title}
                description={courseData.data.description}
                image={courseData.data.thumbnail_url}
            />

            <ProgressCard
                completedLessons={completedLessons}
                totalLessons={courseData.data.lessons.length}
                completedExams={completedExams}
                totalExams={courseData.data.exams.length}
                totalExercises={courseData.data.exercises.length}
                completedExercises={completedExercises}
                t={t}
            />

            <Tabs defaultValue="lessons" className="w-full space-y-8">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="lessons">{t('dashboard.student.CourseStudentPage.lessons')}</TabsTrigger>
                    <TabsTrigger value="exercises">{t('dashboard.student.CourseStudentPage.exercises')}</TabsTrigger>
                    <TabsTrigger value="exams">{t('dashboard.student.CourseStudentPage.exams')}</TabsTrigger>
                </TabsList>
                <TabsContent
                    className={
                        cn('grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                            courseData.data.lessons.length === 0 && 'flex justify-center'
                        )
                    }
                    value="lessons"
                >
                    {courseData.data.lessons.length > 0 ? courseData.data.lessons
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((lesson) => {
                            const status = lesson.lesson_completions.length > 0 ? 'Completed' : lesson.lessons_ai_task_messages.length > 0 ? 'In Progress' : 'Not Started'

                            return (
                                <LessonCard
                                    key={lesson.id}
                                    image={lesson.image}
                                    title={lesson.title}
                                    number={lesson.sequence}
                                    description={lesson.description}
                                    status={status}
                                    courseId={courseData.data.course_id}
                                    lessonId={lesson.id}
                                    t={t}
                                />
                            )
                        }
                        ) : (
                        <NoDataPlaceholder
                            iconSrc="/img/404(2).jpeg"
                            iconAlt="No Data"
                            message={t('dashboard.student.CourseStudentPage.noLessons')}
                            description={t('dashboard.student.CourseStudentPage.noLessonsDescription')}
                        />
                    )}
                </TabsContent>
                <TabsContent
                    className={
                        cn('grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                            courseData.data.exercises.length === 0 && 'flex justify-center'
                        )
                    }
                    value="exercises"
                >
                    {courseData.data.exercises.length > 0 ? courseData.data.exercises
                        .map((exercise) => {
                            // if exercise has a completion, it is completed, else if it has a message, it is in progress else not started
                            const status = exercise.exercise_completions?.length > 0 ? 'Completed' : exercise.exercise_messages?.length > 0 ? 'In Progress' : 'Not Started'

                            return (
                                <ExerciseCard
                                    key={exercise.id}
                                    title={exercise.title}
                                    description={exercise.description}
                                    difficulty={exercise.difficulty_level}
                                    type={exercise.exercise_type}
                                    status={status}
                                    courseId={courseData.data.course_id}
                                    exerciseId={exercise.id}
                                    t={t}
                                />
                            )
                        }
                        ) : (
                        <NoDataPlaceholder
                            iconSrc="/img/404(2).jpeg"
                            iconAlt="No Data"
                            message={t('dashboard.student.CourseStudentPage.noExercises')}
                            description={t('dashboard.student.CourseStudentPage.noExercisesDescription')}
                        />
                    )}
                </TabsContent>
                <TabsContent
                    className={
                        cn('grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                            courseData.data.exams.length === 0 && 'flex justify-center'
                        )
                    }
                    value="exams"
                >
                    {courseData.data.exams.length > 0 ? courseData.data.exams
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((exam) => (
                            <ExamCard
                                key={exam.exam_id}
                                title={exam.title}
                                number={exam.sequence}
                                description={exam.description}
                                status={
                                    exam.exam_submissions.length > 0
                                        ? exam.exam_submissions[0].exam_scores.length > 0
                                            ? 'Completed'
                                            : 'Waiting for Review'
                                        : 'Not Started'
                                }
                                grade={
                                    exam.exam_submissions.length > 0 && exam.exam_submissions[0].exam_scores.length > 0
                                        ? exam.exam_submissions[0].exam_scores[0].score
                                        : undefined
                                }
                                courseId={courseData.data.course_id}
                                examId={exam.exam_id}
                                t={t}
                            />
                        )) : (
                        <NoDataPlaceholder
                            iconSrc="/img/404(2).jpeg"
                            iconAlt="No Data"
                            message={t('dashboard.student.CourseStudentPage.noExams')}
                            description={t('dashboard.student.CourseStudentPage.noExamsDescription')}
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

const NoDataPlaceholder = ({ iconSrc, iconAlt, message, description }) => (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-white dark:bg-gray-800 rounded-lg shadow-md container mx-auto">
        <Image src={iconSrc} alt={iconAlt} width={250} height={250} className="mb-4 rounded-lg" />
        <h2 className="text-xl font-semibold mb-2">{message}</h2>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
)
