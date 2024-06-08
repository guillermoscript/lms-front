
import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import LessonNavigationButtons from '@/components/dashboards/student/course/lessons/LessonNavigationButtons'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import TaksMessages from '@/components/dashboards/student/course/lessons/TaksMessages'
import { Badge } from '@/components/ui/badge'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

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
    const lessonData = await supabase
        .from('lessons')
        .select(`*,
            courses(*),
			lesson_comments(*,
				profiles(*)
			),
            lessons_ai_tasks(*),
            lessons_ai_task_messages(*)
        `)
        .eq('id', params.lessonsId)
        .single()

    // TODO - finish the completion of the lesson
    const lessonCompletion = await supabase
        .from('lesson_completions')
        .select('id')
        .eq('user_id', user.data.user.id)
        .eq('lesson_id', lessonData.data.id)
        .single()

    if (lessonData.error) {
        console.log(lessonData.error)
        throw new Error(lessonData.error.message)
    }

    const isLessonAiTaskCompleted = lessonCompletion?.data?.id

    console.log(isLessonAiTaskCompleted)

    console.log(lessonData.data.lessons_ai_tasks)

    return (
        <>
            <LessonPage
                sideBar={
                    <CommentsSections
                        lesson_id={lessonData.data.id}
                        lesson_comments={lessonData.data.lesson_comments}
                    />
                }
            >
                <Content
                    lessonData={lessonData.data}
                    courseData={lessonData.data.courses}
                    lessonsAiTasks={lessonData.data.lessons_ai_tasks[0]}
                    lessonsAiTasksMessages={lessonData.data.lessons_ai_task_messages}
                    isLessonAiTaskCompleted={!!isLessonAiTaskCompleted}
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
    isLessonAiTaskCompleted
}: {
    lessonData: Tables<'lessons'>
    courseData: Tables<'courses'>
    lessonsAiTasks: Tables<'lessons_ai_tasks'>
    lessonsAiTasksMessages: Array<Tables<'lessons_ai_task_messages'>>
    isLessonAiTaskCompleted?: boolean
}) {
    return (
        <div className="flex flex-col gap-8 w-full">
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
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
                            href={`/dashboard/student/courses/${lessonData.course_id}`}
                        >
                            {courseData?.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${lessonData.course_id}/lessons/`}
                        >
              Lessons
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${lessonData.course_id}`}
                        >
                            {lessonData.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href={`/dashboard/student/courses/${lessonData.course_id}/lessons/${lessonData.id}`}
                        >
                            {lessonData.title}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <div className="flex flex-col gap-8 w-full">
                <div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold">{lessonData.title}</h1>
                        <Badge variant="default">Lesson # {lessonData.sequence}</Badge>
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
                <div className="prose dark:prose-invert max-w-none">
                    <ViewMarkdown markdown={lessonData.content} />
                </div>
                {lessonData.summary && (
                    <div className="mt-8">
                        <h3 className="text-2xl font-bold">Summary</h3>
                        <ViewMarkdown markdown={lessonData.summary} />
                    </div>
                )}
            </div>
            {lessonsAiTasks.system_prompt && (
                <>
                    <h3 className="text-xl font-semibold mt-4">Try the chat sandbox</h3>
                    <div className="flex flex-col gap-4 rounded border p-4">
                        <TaksMessages
                            lessonId={lessonData.id}
                            systemPrompt={lessonsAiTasks.system_prompt}
                            initialMessages={lessonsAiTasksMessages}
                            isLessonAiTaskCompleted={isLessonAiTaskCompleted}
                        />
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
