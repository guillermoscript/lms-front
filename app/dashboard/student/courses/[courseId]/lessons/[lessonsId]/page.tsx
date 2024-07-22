
import { CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import AiTaskMessage from '@/components/dashboards/student/course/lessons/AiTaskMessage'
import LessonNavigationButtons from '@/components/dashboards/student/course/lessons/LessonNavigationButtons'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import LessonsTimeLine from '@/components/dashboards/student/course/lessons/LessonsTimeLine'
import TableOfContents from '@/components/dashboards/student/course/lessons/LessonTableOfContent'
import TaksMessages from '@/components/dashboards/student/course/lessons/TaksMessages'
import { Badge } from '@/components/ui/badge'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export const metadata = {
    title: 'Student Lesson Page',
    description: 'View and track your progress through the lesson.'
}

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function StudentLessonPage ({
    params
}: {
    params: { lessonsId: string, courseId: string }
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    const lessonData = await supabase
        .from('lessons')
        .select(`*,
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
        <>
            <LessonPage
                sideBar={
                    <Tabs defaultValue="comments" className="w-full flex items-center justify-center flex-col">
                        <TabsList
                            className='flex-col md:flex-row gap-2 h-auto md:h-10 md:gap-4 w-full md:w-auto mx-0 md:mx-3'
                        >
                            <TabsTrigger value="comments">Comments</TabsTrigger>
                            <TabsTrigger value="timeline">Timeline</TabsTrigger>
                            <TabsTrigger value="tableOfContents">Table of Contents</TabsTrigger>
                        </TabsList>
                        <TabsContent value="comments">
                            <Suspense fallback={<div>Loading...</div>}>
                                <CommentsSections
                                    course_id={Number(params.courseId)}
                                    lesson_id={lessonData.data.id}
                                    lesson_comments={lessonData.data.lesson_comments}
                                />
                            </Suspense>
                        </TabsContent>
                        <TabsContent
                            className='p-4 md:p-6'
                            value="timeline"
                        >
                            <LessonsTimeLine
                                courseId={Number(params.courseId)}
                                lessonId={Number(params.lessonsId)}
                            />
                        </TabsContent>
                        <TabsContent
                            className='p-4 md:p-6 '
                            value="tableOfContents"
                        >
                            <TableOfContents
                                markdown={lessonData.data.content}
                            />
                        </TabsContent>
                    </Tabs>
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
        </>
    )
}

function Content ({
    lessonData,
    courseData,
    lessonsAiTasks,
    lessonsAiTasksMessages,
    isLessonAiTaskCompleted,
    userId
}: {
    lessonData: Tables<'lessons'>
    courseData: Tables<'courses'>
    lessonsAiTasks: Tables<'lessons_ai_tasks'>
    lessonsAiTasksMessages: Array<Tables<'lessons_ai_task_messages'>>
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
                    { href: `/dashboard/student/courses/${lessonData.course_id}`, label: courseData?.title },
                    { href: `/dashboard/student/courses/${lessonData.course_id}/lessons`, label: 'Lessons' },
                    { href: `/dashboard/student/courses/${lessonData.course_id}/lessons/${lessonData.id}`, label: lessonData.title }
                ]}
            />
            <div className="flex flex-col gap-8 w-full max-w-xs sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 md:flex-row items-center justify-between">
                        <h1 className="text-3xl font-bold">
                            {lessonData.title}
                        </h1>
                        <div className='flex gap-2'>
                            <Badge variant="default">Lesson # {lessonData.sequence}</Badge>
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
                            width={'100%'}
                            height={'500'}
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
                    <ViewMarkdown markdown={lessonData.content} />
                </div>
                {lessonData?.summary && (
                    <div className="mt-8">
                        <h3 className="text-2xl font-bold">Summary</h3>
                        <ViewMarkdown markdown={lessonData.summary} />
                    </div>
                )}
            </div>
            {lessonsAiTasks?.system_prompt && (
                <>
                    <h3 className="text-xl font-semibold mt-4">Try the chat sandbox</h3>
                    <div className="flex flex-col gap-4 rounded border p-4">
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
                    </div>
                </>
            )}
            <LessonNavigationButtons
                courseId={lessonData.course_id}
                lessonId={lessonData.id}
            />
        </div>
    )
}
