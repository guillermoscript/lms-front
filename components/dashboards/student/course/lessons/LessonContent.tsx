
import dayjs from 'dayjs'
import { CheckCircle, PlayCircle } from 'lucide-react'
import Image from 'next/image'

import { getI18n } from '@/app/locales/server'
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
import ResetTaskAIConversation from './ResetTaskAIConversation'
import TaskMessageTour from './TaskMessageTour'
import ToggleableSection from './ToggleableSection'

export default async function EnhancedLessonContent({
    lessonData,
    courseData,
    lessonsAiTasks,
    lessonsAiTasksMessages,
    isLessonAiTaskCompleted,
    userId,
}: {
    lessonData: any
    courseData: any
    lessonsAiTasks: any
    lessonsAiTasksMessages: any[]
    isLessonAiTaskCompleted?: boolean
    userId: string
}) {
    const t = await getI18n()
    const sortedMessages = lessonsAiTasksMessages.sort(
        (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix()
    )

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/student', label: t('BreadcrumbComponent.student') },
                    { href: '/dashboard/student/courses/', label: t('BreadcrumbComponent.course') },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}`,
                        label: courseData?.title,
                    },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}/lessons`,
                        label: t('BreadcrumbComponent.lesson'),
                    },
                    {
                        href: `/dashboard/student/courses/${lessonData.course_id}/lessons/${lessonData.id}`,
                        label: lessonData.title,
                    },
                ]}
            />

            <Card className="mt-8">
                <CardHeader className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-shrink-0">
                        <Image
                            src={lessonData.image || '/img/placeholder.svg'}
                            alt={lessonData.title}
                            width={100}
                            height={100}
                            className="rounded-full object-cover"
                        />
                    </div>
                    <div className="flex-grow">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-3xl">{lessonData.title}</CardTitle>
                            <Badge variant="default">#{lessonData.sequence}</Badge>
                            {isLessonAiTaskCompleted && (
                                <CheckCircle className="h-6 w-6 text-green-500" />
                            )}
                        </div>
                        <CardDescription className="mt-2">{lessonData.description}</CardDescription>
                    </div>
                </CardHeader>
            </Card>

            {lessonData.video_url && (
                <ToggleableSection
                    isOpen
                    title={<><PlayCircle className="h-6 w-6" />{t('LessonContent.video')}</>}
                >
                    <div className="aspect-w-16 aspect-h-9">
                        <iframe
                            src={lessonData.video_url}
                            title="Lesson Video"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full"
                        ></iframe>
                    </div>
                </ToggleableSection>
            )}

            <ToggleableSection
                isOpen
                title={t('LessonContent.content')}
            >
                <div className="prose dark:prose-invert max-w-none">
                    <ViewMarkdown addLinks={true} markdown={lessonData.content} />
                </div>
            </ToggleableSection>

            {lessonData?.summary && (
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle className="text-2xl">{t('LessonContent.summary')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ViewMarkdown markdown={lessonData.summary} />
                    </CardContent>
                </Card>
            )}

            {lessonsAiTasks?.system_prompt && (
                <ToggleableSection
                    isOpen={false}
                    title={t('LessonContent.aiTask')}
                >
                    <>
                        <CardHeader className="flex flex-col gap-4">
                            <div className="flex items-center justify-between w-full">
                                <CardTitle>{t('LessonContent.aiTask')}</CardTitle>
                                <div id="task-status" className="flex items-center gap-2">
                                    <Badge variant={isLessonAiTaskCompleted ? 'default' : 'outline'}>
                                        {isLessonAiTaskCompleted
                                            ? t('LessonContent.aiTaskCompleted')
                                            : t('LessonContent.aiTaksInComplete')}
                                    </Badge>
                                    <TaskMessageTour />
                                </div>
                            </div>
                            <CardDescription id="task-instructions">
                                <ViewMarkdown markdown={lessonsAiTasks.task_instructions} />
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <Separator />
                            <ResetTaskAIConversation lessonId={lessonData.id} />
                            <CustomErrorBoundary
                                fallback={
                                    <RetryError
                                        title={t('LessonContent.RetryError')}
                                        description={t('LessonContent.RetryError.description')}
                                    />
                                }
                            >
                                <AiTaskMessage
                                    userId={userId}
                                    lessonId={lessonData.id.toString()}
                                    systemPrompt={lessonsAiTasks.system_prompt}
                                    lessonsAiTasks={lessonsAiTasks}
                                    lessonsAiTasksMessages={lessonsAiTasksMessages}
                                >
                                    <TaksMessages
                                        lessonId={lessonData.id}
                                        isLessonAiTaskCompleted={isLessonAiTaskCompleted}
                                    />
                                </AiTaskMessage>
                            </CustomErrorBoundary>
                        </CardContent>
                    </>
                </ToggleableSection>
            )}

            <div className="mt-8">
                <LessonNavigationButtons courseId={lessonData.course_id} lessonId={lessonData.id} />
            </div>

            <LessonLoaderView userId={userId} lessonId={lessonData.id} />
        </div>
    )
}
