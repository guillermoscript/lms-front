import { Suspense } from 'react'

import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import ListOfReviews from '@/components/dashboards/Common/reviews/ListOfReviews'
import LessonContent from '@/components/dashboards/student/course/lessons/LessonContent'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import LessonsTimeLine from '@/components/dashboards/student/course/lessons/LessonsTimeLine'
import TableOfContents from '@/components/dashboards/student/course/lessons/LessonTableOfContent'
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
            <LessonContent
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
