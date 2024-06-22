import Link from 'next/link'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import TaskMessageSandbox from '@/components/dashboards/teacher/lessons/TaskMessageSandbox'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/utils/supabase/server'

export default async function TeacherLessonPage ({
    params
}: {
    params: { courseId: string, lessonId: string }
}) {
    const supabase = createClient()

    const lesson = await supabase
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
        .eq('id', params.lessonId)
        .single()

    if (lesson.error != null) {
        console.log(lesson.error.message)
        throw new Error(lesson.error.message)
    }

    return (
        <LessonPage
            sideBar={
                <CommentsSections
                    lesson_id={lesson?.data?.id}
                    lesson_comments={lesson?.data?.lesson_comments}
                />
            }
        >
            <div className="flex-1 md:p-8 overflow-y-auto w-full space-y-4">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/dashboard/teacher">Teacher</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/dashboard/teacher/courses">
                Courses
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink
                                href={`/dashboard/teacher/courses/${params.courseId}`}
                            >
                                {lesson?.data?.courses?.title}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink
                                href={`/dashboard/teacher/courses/${params.courseId}/${params.lessonId}`}
                            >
                                {lesson?.data?.title}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <div className="flex flex-col gap-8 w-full">
                    <div className="flex justify-between items-center w-full">
                        <h1 className="text-2xl font-semibold mb-4">
              Lesson: {lesson?.data?.title}
                        </h1>
                        <Link
                            href={`/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}/edit`}
                            className={buttonVariants({ variant: 'link' })}
                        >
              Edit
                        </Link>
                    </div>

                    <h3 className="text-lg font-semibold mt-4">
            Status: {lesson?.data?.status}
                    </h3>
                    <h3 className="text-lg font-semibold mt-4">
            Sequence: {lesson?.data?.sequence}
                    </h3>
                    <p>{lesson?.data?.description}</p>

                    <Separator />

                    {lesson.data?.video_url && (
                        <>
                            <h3 className="text-xl font-semibold mt-4">Youtube Video</h3>
                            <iframe
                                className="w-full"
                                height="415"
                                src={lesson.data?.video_url}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                            <Separator />
                        </>
                    )}

                    {lesson.data?.embed_code ? (
                        <div className="flex flex-col mb-10 gap-4">
                            <h3 className="text-xl font-semibold mt-4">Embeded Code</h3>
                            <iframe
                                src={lesson.data?.embed_code}
                                style={{
                                    width: '100%',
                                    height: 600,
                                    border: 0,
                                    borderRadius: 4,
                                    overflow: 'hidden'
                                }}
                                title="htmx basic website"
                                allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                                className="resize "
                            />
                            <Separator />
                        </div>
                    ) : null}

                    <div className="flex flex-col mb-10 gap-4">
                        <h3 className="text-xl font-semibold mt-4">Content</h3>
                        <Markdown className={' markdown-body'} remarkPlugins={[remarkGfm]}>
                            {lesson.data?.content}
                        </Markdown>
                    </div>

                    <Separator />

                    <h3 className="text-xl font-semibold mt-4">System Prompt</h3>

                    <Markdown className={' markdown-body'} remarkPlugins={[remarkGfm]}>
                        {lesson.data?.lessons_ai_tasks[0].system_prompt}
                    </Markdown>

                    <Separator />

                    <h3 className="text-xl font-semibold mt-4">Try the chat sandbox</h3>

                    <TaskMessageSandbox
                        systemPrompt={lesson.data?.lessons_ai_tasks[0].system_prompt}
                    />
                </div>
            </div>
        </LessonPage>
    )
}
