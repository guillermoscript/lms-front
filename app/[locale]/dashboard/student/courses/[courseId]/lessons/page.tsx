import { CheckCircle, ChevronRight, Clock } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'

export const metadata = {
    title: 'Student Course Lessons',
    description: 'View and track your progress through the course lessons.'
}

export default async function StudentCourseLessonsPage({
    params
}: {
    params: {
        courseId: string
    }
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    const t = await getI18n()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    const lessons = await supabase
        .from('lessons')
        .select('*,courses(*),lesson_completions(*)')
        .eq('course_id', params.courseId)
        .eq('lesson_completions.user_id', user.data.user.id)
        .order('sequence')

    if (lessons.error != null) {
        throw new Error(lessons.error.message)
    }

    const completedLessons = lessons.data.filter(lesson => lesson.lesson_completions.length > 0).length
    const totalLessons = lessons.data.length
    const progressPercentage = (completedLessons / totalLessons) * 100

    return (
        <div className="container mx-auto px-4 py-8">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                    { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                    { href: `/dashboard/student/courses/${lessons.data[0].course_id}`, label: lessons.data[0]?.courses?.title },
                    { href: `/dashboard/student/courses/${lessons.data[0].course_id}/lesson`, label: t('BreadcrumbComponent.lesson') }
                ]}
            />
            <div className="mt-8 mb-12">
                <h1 className="text-4xl font-bold mb-4">{lessons.data[0]?.courses?.title}</h1>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
                    {t('dashboard.student.LessonPage.description')}
                </p>
                <div className="flex items-center gap-4">
                    <Progress value={progressPercentage} className="w-full" />
                    <span className="text-sm font-medium">{`${completedLessons}/${totalLessons}`}</span>
                </div>
            </div>
            <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {lessons.data.map((lesson) => (
                    <LessonCard
                        key={lesson.id}
                        number={lesson.sequence}
                        title={lesson.title}
                        description={lesson.description}
                        status={
                            lesson.lesson_completions.length > 0
                                ? t('dashboard.student.StudentCourseLessonsPage.completed')
                                : t('dashboard.student.StudentCourseLessonsPage.notStarted')
                        }
                        action={
                            lesson.lesson_completions.length > 0
                                ? t('dashboard.student.StudentCourseLessonsPage.review')
                                : t('dashboard.student.StudentCourseLessonsPage.start')
                        }
                        Icon={
                            lesson.lesson_completions.length > 0
                                ? CheckCircle
                                : Clock
                        }
                        completedText={t('dashboard.student.StudentCourseLessonsPage.completed')}
                        notStartedText={t('dashboard.student.StudentCourseLessonsPage.notStarted')}
                        courseId={lesson.course_id}
                        lessonId={lesson.id}
                        img={lesson.image}
                    />
                ))}
            </div>
        </div>
    )
}

function LessonCard({
    number,
    title,
    description,
    status,
    action,
    Icon,
    courseId,
    lessonId,
    completedText,
    img
}: {
    number: number
    title: string
    description: string
    status: string
    action: string
    Icon: React.FC<React.SVGProps<SVGSVGElement>>
    courseId: number
    lessonId: number
    img: string
    completedText: string
    notStartedText: string
}) {
    const isCompleted = status === completedText

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
            <div className="relative h-48">
                <Image
                    src={img}
                    alt={title}
                    layout="fill"
                    objectFit="cover"
                    className="transition-transform duration-300 hover:scale-105"
                />
                <div className="absolute top-2 left-2 bg-white dark:bg-gray-800 rounded-full px-2 py-1 text-sm font-semibold">
                   <p>{`Lesson ${number}`}</p>
                </div>
            </div>
            <div className="p-6">
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{description}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Icon className={cn('w-5 h-5 mr-2', isCompleted ? 'text-green-500' : 'text-yellow-500')} />
                        <span className={cn('text-sm font-medium', isCompleted ? 'text-green-500' : 'text-yellow-500')}>
                            {status}
                        </span>
                    </div>
                    <Link
                        href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}
                        className={cn(
                            'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors',
                            isCompleted
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-700 dark:text-green-100 dark:hover:bg-green-600'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-700 dark:text-blue-100 dark:hover:bg-blue-600'
                        )}
                    >
                        {action}
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                </div>
            </div>
        </div>
    )
}
