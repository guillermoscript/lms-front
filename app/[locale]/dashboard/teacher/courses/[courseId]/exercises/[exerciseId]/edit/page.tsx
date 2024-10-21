import { getI18n } from '@/app/locales/server'
import ChatBox from '@/components/chatbox/ChatBox'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExerciseForm from '@/components/dashboards/teacher/exercises/ExerciseForm'
import { createClient } from '@/utils/supabase/server'

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function EditLessonPage({
    params,
}: {
    params: { courseId: string; exerciseId: string }
}) {
    const supabase = createClient()
    const exercise = await supabase
        .from('exercises')
        .select('*, courses(*)')
        .eq('id', params.exerciseId)
        .single()

    if (exercise.error != null) {
        console.log(exercise.error.message)
    }

    const user = await supabase.auth.getUser()

    const profile = await supabase
        .from('profiles')
        .select('full_name,avatar_url')
        .eq('id', user.data.user.id).single()

    const t = await getI18n()

    const initialValues = {
        title: exercise?.data?.title,
        description: exercise?.data?.description,
        instructions: exercise?.data?.instructions,
        systemPrompt: exercise?.data?.system_prompt,
        exerciseType: exercise?.data?.exercise_type,
        difficultyLevel: exercise?.data?.difficulty_level,
        timeLimit: exercise?.data?.time_limit?.toString(),
    }

    return (
        <div className=" container mx-auto">
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
                        label: exercise?.data?.courses?.title,
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises`,
                        label: t('BreadcrumbComponent.exercise'),
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}`,
                        label: exercise?.data?.title,
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}/edit`,
                        label: t('BreadcrumbComponent.edit'),
                    },
                ]}
            />

            <ExerciseForm initialValues={initialValues} params={params} />
            <ChatBox
                profile={profile.data}
                instructions={`Eres un profesor que esta ayudando a un colega a editar este ejercicio ${exercise.data.title}.
                El contenido del ejercicio es este: ${exercise.data.instructions}.
                Por favor, asegúrate de que el ejercicio sea claro y conciso y apoya a tu colega en lo que necesite.
                `}
            />
        </div>
    )
}
