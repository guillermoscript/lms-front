import { getScopedI18n } from '@/app/locales/server'
import ExerciseCard from '@/components/dashboards/exercises/ExerciseCard'
import { createClient } from '@/utils/supabase/server'

export default async function ExerciseSuggestions({ lessonId }) {
    const t = await getScopedI18n('ExerciseSuggestions')
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    const exerciseData = await supabase
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
        .eq('lesson_id', lessonId)

        .eq('exercise_completions.user_id', userData.data.user.id)
        .eq('exercise_messages.user_id', userData.data.user.id)

    if (exerciseData.error) {
        console.log('Error getting exercise data', exerciseData.error)
        return null
    }

    if (exerciseData.data.length === 0) {
        return null
        // return (
        //     <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-md">
        //         <h4 className="text-3xl font-bold text-gray-800 mb-4">
        //             <i className="fas fa-exclamation-circle text-red-500 mr-2"></i>
        //             {t('noExercisesFound')}
        //         </h4>
        //         <p className="text-gray-500 text-center mb-4">
        //             {t('noExercisesDescription')}
        //         </p>
        //     </div>
        // )
    }

    return (
        <div className="flex flex-col gap-6 items-center justify-center">
            <h1 className="text-2xl font-bold text-gray-800">
                {t('exerciseSuggestions')}
            </h1>
            <p className="text-gray-500">
                {t('exerciseSuggestionsDescription')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
