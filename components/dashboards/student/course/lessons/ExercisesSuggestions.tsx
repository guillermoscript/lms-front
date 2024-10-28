import { getScopedI18n } from '@/app/locales/server'
import ExerciseCard from '@/components/dashboards/exercises/ExerciseCard'
import { createClient } from '@/utils/supabase/server'

export default async function ExerciseSuggestions({ lessonId }: {
    lessonId?: string
}) {
    const t = await getScopedI18n('ExerciseSuggestions')
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    let query = supabase
        .from('exercises')
        .select(
            `
            id, 
            title,
            description,
            exercise_type,
            difficulty_level,
            time_limit,
            courses(*),
            exercise_completions(id),
            exercise_messages(id)
        `
        )
        .eq('exercise_completions.user_id', userData.data.user.id)
        .eq('exercise_messages.user_id', userData.data.user.id)

    if (lessonId) {
        query = query.eq('lesson_id', lessonId)
    } else {
        query = query.limit(3)
    }

    const exerciseData = await query

    if (exerciseData.error) {
        console.log('Error getting exercise data', exerciseData.error)
        return null
    }

    if (exerciseData.data.length === 0) {
        return null
    }

    return (
        <div className="flex flex-col gap-6 items-center justify-center">
            <h1 className="text-2xl font-bold">
                {t('exerciseSuggestions')}
            </h1>
            <p className="text-gray-500">
                {t('exerciseSuggestionsDescription')}
            </p>
            <div className="flex flex-wrap items-center gap-4 justify-center">
                {exerciseData.data.map((exercise) => {
                    return (
                        <ExerciseCard
                            key={exercise.id}
                            exercise={exercise as any}
                            courseId={exercise.courses.course_id as any}
                            t={t}
                        />
                    )
                })}
            </div>
        </div>
    )
}
