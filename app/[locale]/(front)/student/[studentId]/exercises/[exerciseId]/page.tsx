import { getI18n } from '@/app/locales/server'
import StudentPublicExercisePage from '@/components/front/StudentPublicExercisePage'
import { createClient } from '@/utils/supabase/server'

export default async function ExerciseStudentPage({
    params,
}: {
    params: { exerciseId: string; studentId: string }
}) {
    const supabase = createClient()

    const exercise = await supabase
        .from('exercises')
        .select(
            `*,
            courses(title),
            exercise_completions(*),
            exercise_messages(id,message,role,created_at)`
        )
        .eq('id', params.exerciseId)
        .eq('exercise_completions.user_id', params.studentId)
        .eq('exercise_messages.user_id', params.studentId)
        .order('created_at', {
            referencedTable: 'exercise_messages',
            ascending: true,
        })
        .single()

    const profile = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', params.studentId)
        .single()

    const t = await getI18n()

    const isExerciseCompleted = exercise.data?.exercise_completions.length > 0

    return (
        <div className="md:container mx-auto space-y-4">
            <StudentPublicExercisePage
                exercise={exercise.data}
                profile={profile.data}
                isExerciseCompleted={isExerciseCompleted}
            />
        </div>
    )
}
