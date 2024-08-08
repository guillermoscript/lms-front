
import dayjs from 'dayjs'
import { CheckCircle } from 'lucide-react'
import Image from 'next/image'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import AiTaskMessage from '@/components/dashboards/student/course/lessons/AiTaskMessage'
import LessonNavigationButtons from '@/components/dashboards/student/course/lessons/LessonNavigationButtons'
import TaksMessages from '@/components/dashboards/student/course/lessons/TaksMessages'
import CustomErrorBoundary from '@/components/errors/CustomErrorBoundary'
import RetryError from '@/components/errors/RetryError'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'

import LessonLoaderView from './LessonLoaderView'

export default function LessonContent({
    lessonData,
    courseData,
    lessonsAiTasks,
    lessonsAiTasksMessages,
    isLessonAiTaskCompleted,
    userId,
}: {
    lessonData: any // Define proper type
    courseData: any // Define proper type
    lessonsAiTasks: any // Define proper type
    lessonsAiTasksMessages: any[] // Define proper type
    isLessonAiTaskCompleted?: boolean
    userId: string
}) {
    const sortedMessages = lessonsAiTasksMessages.sort(
        (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix()
    )

    return (
        <div className="flex flex-col gap-8 w-full">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/student', label: 'Student' },
                    { href: '/dashboard/student/courses/', label: 'Courses' },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}`,
                        label: courseData?.title,
                    },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}/lessons`,
                        label: 'Lessons',
                    },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}/lessons/${lessonData.id}`,
                        label: lessonData.title,
                    },
                ]}
            />
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                    <div className='flex flex-row-reverse md:flex-row md:items-center items-start  gap-2'>
                        {lessonData.image && (
                            <Image
                                src={lessonData.image}
                                alt={lessonData.title}
                                width={100}
                                height={100}
                                className="rounded-full object-cover "
                                placeholder='blur'
                                blurDataURL='/img/placeholder.svg'
                            />
                        )}
                        <div className='w-full'>
                            <h1 className="text-3xl font-bold">{lessonData.title}</h1>
                            <p className="text-gray-500 dark:text-gray-400">
                                {lessonData.description}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 min-w-[100px]">
                        <Badge variant="default">
                            Lesson # {lessonData.sequence}
                        </Badge>
                        {isLessonAiTaskCompleted && (
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        )}
                    </div>
                </div>

            </div>
            {lessonData.video_url && (
                <>
                    <h2 className="text-2xl font-bold">Video</h2>
                    <iframe
                        width="100%"
                        height="500"
                        src={lessonData.video_url}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    ></iframe>
                </>
            )}
            <div className="prose dark:prose-invert">
                <ViewMarkdown addLinks={true} markdown={lessonData.content} />
            </div>
            {lessonData?.summary && (
                <div className="mt-8">
                    <h3 className="text-2xl font-bold">Summary</h3>
                    <ViewMarkdown markdown={lessonData.summary} />
                </div>
            )}
            {lessonsAiTasks?.system_prompt && (
                <>
                    <Separator />
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between w-full">
                                <CardTitle>AI Task</CardTitle>
                                {isLessonAiTaskCompleted ? (
                                    <div>
                                        <Badge>Task Completed</Badge>
                                    </div>
                                ) : (
                                    <div>
                                        <Badge variant="outline">
                                            Task Incomplete
                                        </Badge>
                                    </div>
                                )}
                            </div>
                            <CardDescription>
                                <ViewMarkdown
                                    markdown={lessonsAiTasks.task_instructions}
                                />
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 p-2 md:p-4 lg:p-6">
                            <Separator />
                            <CustomErrorBoundary fallback={
                                <RetryError
                                    title="Error loading AI Task"
                                    description="There was an issue loading the AI Task"
                                />
                            }
                            >
                                <AiTaskMessage
                                    userId={userId}
                                    lessonId={lessonData.id.toString()}
                                    systemPrompt={lessonsAiTasks.system_prompt}
                                    lessonsAiTasks={lessonsAiTasks}
                                    lessonsAiTasksMessages={sortedMessages}
                                >
                                    <TaksMessages
                                        lessonId={lessonData.id}
                                        isLessonAiTaskCompleted={
                                            isLessonAiTaskCompleted
                                        }
                                    />
                                </AiTaskMessage>
                            </CustomErrorBoundary>
                        </CardContent>
                    </Card>
                </>
            )}
            <LessonNavigationButtons
                courseId={lessonData.course_id}
                lessonId={lessonData.id}
            />
            <LessonLoaderView userId={userId} lessonId={lessonData.id} />
        </div>
    )
}
