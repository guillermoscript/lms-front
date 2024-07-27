import { CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import ListOfReviews from '@/components/dashboards/Common/reviews/ListOfReviews'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import AiTaskMessage from '@/components/dashboards/student/course/lessons/AiTaskMessage'
import LessonNavigationButtons from '@/components/dashboards/student/course/lessons/LessonNavigationButtons'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import LessonsTimeLine from '@/components/dashboards/student/course/lessons/LessonsTimeLine'
import TableOfContents from '@/components/dashboards/student/course/lessons/LessonTableOfContent'
import TaksMessages from '@/components/dashboards/student/course/lessons/TaksMessages'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

export const metadata = {
    title: 'Student Lesson Page',
    description: 'View and track your progress through the lesson.',
}

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function StudentLessonPage({
    params,
}: {
    params: { lessonsId: string; courseId: string };
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    if (user.error != null) {
        throw new Error(user.error.message)
    }
    const lessonData = await supabase.from('lessons').select(`*,
      courses(*),
      lesson_comments(*,
      profiles(*),
      comment_reactions(*)
      ),
      lessons_ai_tasks(*),
      lessons_ai_task_messages(*),
      lesson_completions(lesson_id, user_id)
      `)
        .eq('id', params.lessonsId)
        .eq('lessons_ai_task_messages.user_id', user.data.user.id)
        .eq('lesson_completions.user_id', user.data.user.id)
        .single()

    const isLessonAiTaskCompleted = lessonData.data.lesson_completions.length > 0

    return (
        <LessonPage
            sideBar={
                <Sidebar
                    courseId={Number(params.courseId)}
                    lessonId={lessonData.data.id}
                    lessonData={lessonData.data}
                />
            }
        >
            <Content
                lessonData={lessonData.data}
                courseData={lessonData.data.courses}
                lessonsAiTasks={lessonData.data.lessons_ai_tasks[0]}
                lessonsAiTasksMessages={lessonData.data.lessons_ai_task_messages}
                isLessonAiTaskCompleted={!!isLessonAiTaskCompleted}
                userId={user.data.user.id}
            />
        </LessonPage>
    )
}

function Sidebar({
    courseId,
    lessonId,
    lessonData,
}: {
    courseId: number
    lessonId: number
    lessonData: any
}) {
    return (
        <Tabs
            defaultValue="comments"
            className="w-full flex items-center justify-center flex-col h-auto"
        >
            <TabsList className="flex-col md:flex-row md:flex-wrap gap-2 h-auto md:gap-4 w-full md:w-auto mx-0 md:mx-3">
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="tableOfContents">
                    Table of Contents
                </TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
                <Suspense fallback={<div>Loading...</div>}>
                    <CommentsSections
                        course_id={courseId}
                        lesson_id={lessonId}
                        lesson_comments={lessonData.lesson_comments}
                    />
                </Suspense>
            </TabsContent>
            <TabsContent className="p-4 md:p-6" value="timeline">
                <LessonsTimeLine courseId={courseId} lessonId={lessonId} />
            </TabsContent>
            <TabsContent className="p-4 md:p-6" value="tableOfContents">
                <TableOfContents markdown={lessonData.content} />
            </TabsContent>
            <TabsContent
                className="p-4 md:p-6 flex flex-col gap-4"
                value="reviews"
            >
                <ListOfReviews entityId={lessonId} entityType="lessons" />
            </TabsContent>
        </Tabs>
    )
}

function Content({
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
                <div className="flex flex-col gap-2 md:flex-row items-center justify-between">
                    <h1 className="text-3xl font-bold">{lessonData.title}</h1>
                    <div className="flex gap-2">
                        <Badge variant="default">
                            Lesson # {lessonData.sequence}
                        </Badge>
                        {isLessonAiTaskCompleted && (
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        )}
                    </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400">
                    {lessonData.description}
                </p>
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
                        <CardContent className="flex flex-col gap-4">
                            <Separator />
                            <AiTaskMessage
                                userId={userId}
                                lessonId={lessonData.id.toString()}
                                systemPrompt={lessonsAiTasks.system_prompt}
                                lessonsAiTasks={lessonsAiTasks}
                                lessonsAiTasksMessages={lessonsAiTasksMessages}
                            >
                                <TaksMessages
                                    lessonId={lessonData.id}
                                    isLessonAiTaskCompleted={
                                        isLessonAiTaskCompleted
                                    }
                                />
                            </AiTaskMessage>
                        </CardContent>
                    </Card>
                </>
            )}
            <LessonNavigationButtons
                courseId={lessonData.course_id}
                lessonId={lessonData.id}
            />
        </div>
    )
}
