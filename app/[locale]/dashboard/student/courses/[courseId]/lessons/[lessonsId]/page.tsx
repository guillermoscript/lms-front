import { Suspense } from 'react'

import ChatBox from '@/components/chatbox/ChatBox'
import SidebarLessons from '@/components/dashboards/Common/lessons/SidebarLessons'
import LessonContent from '@/components/dashboards/student/course/lessons/LessonContent'
import LessonPage from '@/components/dashboards/student/course/lessons/LessonPage'
import { createClient } from '@/utils/supabase/server'

import { LessonBodyLoading } from './loading'

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

    const profile = await supabase
        .from('profiles')
        .select('full_name,avatar_url')
        .eq('id', user.data.user.id).single()

    const isLessonAiTaskCompleted = lessonData.data.lesson_completions.length > 0

    const lessonInstructions = `Eres un tutor AI, tu mision es ayudar a los estudiantes con esta leccion. Ten en cuenta lo siguiente:
    1. Lee la leccion y asegurate de entenderla
    2. Responde a las preguntas de los estudiantes
    3. trata de ser lo mas claro posible

    La leccion es la siguiente: ${lessonData.data.title} - ${lessonData.data.description}
    El contenido de la leccion es el siguiente: ${lessonData.data.content}

    Recuerda que tu mision es ayudar a los estudiantes a entender la leccion
    `
    return (
        <LessonPage
            sideBar={
                <Suspense fallback={<>
                    <LessonBodyLoading />
                </>}
                >
                    <SidebarLessons
                        courseId={Number(params.courseId)}
                        lessonId={lessonData.data.id}
                        lessonData={lessonData.data}
                    />
                </Suspense>
            }
        >
            <Suspense fallback={<>
                <LessonBodyLoading />
            </>}
            >

                <LessonContent
                    lessonData={lessonData.data}
                    courseData={lessonData.data.courses}
                    lessonsAiTasks={lessonData.data.lessons_ai_tasks[0]}
                    lessonsAiTasksMessages={lessonData.data.lessons_ai_task_messages}
                    isLessonAiTaskCompleted={!!isLessonAiTaskCompleted}
                    userId={user.data.user.id}
                />
            </Suspense>
            <ChatBox
                profile={profile.data}
                instructions={lessonInstructions}
            />
        </LessonPage>
    )
}
