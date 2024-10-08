import { getI18n } from '@/app/locales/server'
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
    const lesson = await supabase
        .from('exercises')
        .select('*, courses(*)')
        .eq('id', params.exerciseId)
        .single()

    if (lesson.error != null) {
        console.log(lesson.error.message)
    }

    const t = await getI18n()

    const initialValues = {
        title: lesson?.data?.title,
        description: lesson?.data?.description,
        instructions: lesson?.data?.instructions,
        systemPrompt: lesson?.data?.system_prompt,
        exerciseType: lesson?.data?.exercise_type,
        difficultyLevel: lesson?.data?.difficulty_level,
        timeLimit: lesson?.data?.time_limit?.toString(),
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
                        label: lesson?.data?.courses?.title,
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises`,
                        label: t('BreadcrumbComponent.exercise'),
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}`,
                        label: lesson?.data?.title,
                    },
                    {
                        href: `/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}/edit`,
                        label: t('BreadcrumbComponent.edit'),
                    },
                ]}
            />

            <ExerciseForm initialValues={initialValues} params={params} />
        </div>
    )
}
