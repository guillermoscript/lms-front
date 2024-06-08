import { CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/server'

export default async function StudentCourseLessonsPage ({
    params
}: {
    params: {
        courseId: string
    }
}) {
    const supabase = createClient()

    const lessons = await supabase
        .from('lessons')
        .select('*,courses(*),lesson_completions(*)')
        .eq('course_id', params.courseId)
        .order('sequence')

    if (lessons.error != null) {
        throw new Error(lessons.error.message)
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
                            href="/dashboard/student/courses"
                        >
                            Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${lessons.data[0].course_id}`}
                        >
                            {lessons.data[0]?.courses?.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${lessons.data[0].course_id}/lessons`}
                        >
                            Lessons
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <div className="grid gap-8">
                <div>
                    <h1 className="text-3xl font-bold">
                        {lessons.data[0]?.courses?.title}
                        Lessons
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        View and track your progress through the course lessons.
                    </p>
                </div>
                <div className="grid gap-4">
                    {lessons.data.map((lesson) => {
                        return (
                            <LessonCard
                                number={lesson.sequence}
                                title={lesson.title}
                                description={lesson.description}
                                status={
                                    lesson.lesson_completions.length > 0
                                        ? 'Completed'
                                        : 'Not Started'
                                }
                                action={
                                    lesson.lesson_completions.length > 0
                                        ? 'Review'
                                        : 'Start'
                                }
                                Icon={
                                    lesson.lesson_completions.length > 0
                                        ? CheckCircle
                                        : Clock
                                }
                                courseId={(lesson.course_id)}
                                lessonId={(lesson.id)}
                            />
                        )
                    })}
                </div>
            </div>
        </>
    )
}

function LessonCard ({
    number,
    title,
    description,
    status,
    action,
    Icon,
    courseId,
    lessonId
}: {
    number: number
    title: string
    description: string
    status: string
    action: string
    Icon: React.FC<React.SVGProps<SVGSVGElement>>
    courseId: number
    lessonId: number
}) {
    return (
        <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{number}</span>
                    <Icon className={cn('w-5 h-5', status === 'Completed' && 'text-green-500')} />
                </div>
                <div>
                    <h3 className="text-lg font-medium">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {status}
                </span>
                <Link
                    className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                    href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}
                >
                    {action}
                </Link>
            </div>
        </div>
    )
}
