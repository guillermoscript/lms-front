
import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import HelpMessages from '@/components/dashboards/student/course/lessons/HelpMessage'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
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
    const lessonData = await supabase
        .from('lessons')
        .select(
            `*,
            courses(*),
			lesson_comments(*,
				profiles(*)
			),
            lessons_ai_tasks(*)
        `
        )
        .eq('id', params.lessonsId)
        .single()

    if (lessonData.error != null) {
        throw new Error(lessonData.error.message)
    }

    console.log(lessonData)

    return (
        <>
            <LessonPage
                sideBar={
                    <CommentsSections
                        lesson_id={lessonData.data.id}
                        lesson_comments={lessonData.data.lesson_comments}
                    />
                }
                children={
                    <Content
                        lessonData={lessonData.data}
                        courseData={lessonData.data.courses}
                        lessonsAiTasks={lessonData.data.lessons_ai_tasks[0]}
                    />
                }
            />
        </>
    )
}

function Content ({
    lessonData,
    courseData,
    lessonsAiTasks
}: {
    lessonData: Tables<'lessons'>
    courseData: Tables<'courses'>
    lessonsAiTasks: Tables<'lessons_ai_tasks'>
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
                        {/* <TaksMessages systemPrompt={lessonsAiTasks.system_prompt} /> */}
                        <HelpMessages />
                    </div>
                </>
            )}
            {/* <LessonNavigationButtons
                courseId={lessonData.course_id}
                lessonId={lessonData.id}
            /> */}
        </div>
    )
}
