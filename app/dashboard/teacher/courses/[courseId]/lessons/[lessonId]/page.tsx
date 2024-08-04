import Link from 'next/link'

import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/utils/supabase/server'
import { TaskSandboxActions } from '@/actions/dashboard/AI/TaskSandboxActions'
import TaskSandboxMessage from '@/components/dashboards/teacher/course/TaskSandboxMessage'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { generateId } from 'ai'
import SidebarLessons from '@/components/dashboards/Common/lessons/SidebarLessons'

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
        throw new Error(lesson.error.message)
    }
    const initialMessages = [
        { role: 'system', content: lesson.data?.lessons_ai_tasks[0].system_prompt, id: generateId() },
    ]

    return (
        <LessonPage
            sideBar={
                <SidebarLessons
                courseId={Number(params.courseId)}
                lessonId={lesson.data.id}
                lessonData={lesson.data}
            />
            }
        >
            <div className="flex-1 md:p-8 overflow-y-auto w-full space-y-4">
                <BreadcrumbComponent
                    links={[
                        { href: '/dashboard', label: 'Dashboard' },
                        { href: '/dashboard/teacher', label: 'Teacher' },
                        {
                            href: '/dashboard/teacher/courses',
                            label: 'Courses',
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}`,
                            label: lesson?.data?.courses?.title,
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}`,
                            label: lesson?.data?.title,
                        },
                    ]}
                />
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
                            <h3 className="text-xl font-semibold mt-4">
                                Youtube Video
                            </h3>
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
                            <h3 className="text-xl font-semibold mt-4">
                                Embeded Code
                            </h3>
                            <iframe
                                src={lesson.data?.embed_code}
                                style={{
                                    width: '100%',
                                    height: 600,
                                    border: 0,
                                    borderRadius: 4,
                                    overflow: 'hidden',
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
                        <ViewMarkdown
                            markdown={lesson.data?.content}
                        />
                    </div>

                    <Separator />

                    {lesson.data?.lessons_ai_tasks[0].system_prompt && (
                        <>
                            <h3 className="text-xl font-semibold mt-4">
                                System Prompt
                            </h3>

                            <ViewMarkdown
                                markdown={lesson.data?.lessons_ai_tasks[0].system_prompt}
                            />

                            <Separator />

                            <ViewMarkdown
                                markdown={lesson.data?.lessons_ai_tasks[0].task_instructions}
                            />

                            <h3 className="text-xl font-semibold mt-4">
                                Try the chat sandbox
                            </h3>

                            <TaskSandboxActions
                                initialAIState={{
                                    messages: initialMessages as any
                                }}
                            >
                                <TaskSandboxMessage />
                            </TaskSandboxActions>
                        </>
                    )}
                </div>
            </div>
        </LessonPage>
    )
}
