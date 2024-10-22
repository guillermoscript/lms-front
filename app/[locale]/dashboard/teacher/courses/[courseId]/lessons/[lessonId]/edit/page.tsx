import { getI18n } from '@/app/locales/server'
import ChatBox from '@/components/chatbox/ChatBox'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import LessonForm from '@/components/dashboards/teacher/lessons/LessonForm'
import { createClient } from '@/utils/supabase/server'

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function EditLessonPage({
    params,
}: {
    params: { courseId: string; lessonId: string }
}) {
    const supabase = createClient()
    const lesson = await supabase
        .from('lessons')
        .select('*, courses(*),lessons_ai_tasks(*)')
        .eq('id', params.lessonId)
        .single()

    if (lesson.error != null) {
        console.log(lesson.error.message)
    }

    const user = await supabase.auth.getUser()

    const profile = await supabase
        .from('profiles')
        .select('full_name,avatar_url')
        .eq('id', user.data.user.id)
        .single()

    const t = await getI18n()

    const initialValues = {
        title: lesson?.data?.title,
        sequence: lesson?.data?.sequence,
        video_url: lesson?.data?.video_url,
        embed: lesson?.data?.embed_code,
        status: lesson?.data?.status,
        content: lesson?.data?.content,
        description: lesson?.data?.description,
        image: lesson?.data?.image,
        systemPrompt: lesson?.data.lessons_ai_tasks[0]?.system_prompt,
        task_instructions: lesson?.data.lessons_ai_tasks[0]?.task_instructions,
    }

    return (
        <>
            <div className="container mx-auto">
                <BreadcrumbComponent
                    links={[
                        {
                            href: '/dashboard',
                            label: t('BreadcrumbComponent.dashboard'),
                        },
                        {
                            href: '/dashboard/teacher',
                            label: t('BreadcrumbComponent.teacher'),
                        },
                        {
                            href: '/dashboard/teacher/courses',
                            label: t('BreadcrumbComponent.course'),
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}`,
                            label: lesson?.data?.courses?.title,
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}/lessons`,
                            label: t('BreadcrumbComponent.lesson'),
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}`,
                            label: lesson?.data?.title,
                        },
                        {
                            href: `/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}/edit`,
                            label: t('BreadcrumbComponent.edit'),
                        },
                    ]}
                />
            </div>

            <LessonForm params={params} initialValues={initialValues} />
            <ChatBox
                profile={profile.data}
                instructions={`Eres un profesor que ayuda a un colega a editar esta leccion ${lesson.data.title}
                el contendio de la leccion es el siguiente: ${lesson.data.content}

                Ayuda a tu colega a mejorar la leccion en todo lo que te pregunte
                `}
            />
        </>
    )
}
