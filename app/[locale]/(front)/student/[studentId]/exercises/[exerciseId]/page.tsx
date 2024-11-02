import StudentExerciseCodePage from '@/components/dashboards/exercises/StudentExerciseCodePage'
import StudentPublicExercisePage from '@/components/front/StudentPublicExercisePage'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
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

    // Fetch the exercise files
    const { data: exerciseFiles, error: filesError } = await supabase
        .from('exercise_files')
        .select('file_path, content')
        .eq('exercise_id', params.exerciseId)

    if (filesError) {
        console.error('Error fetching exercise files:', filesError)
        // Handle the error appropriately
    }

    const { data: lastSubmission, error: fetchError } = await supabase
        .from('exercise_code_student_submissions')
        .select('submission_code')
        .eq('exercise_id', params.exerciseId)
        .eq('user_id', params.studentId)
        .order('created_at', { ascending: false })
        .single()

    // Construct the files object for MySandpack
    const files = {}
    exerciseFiles?.forEach((file) => {
        files[file.file_path] = file.content
    })

    const isExerciseCompleted = exercise.data?.exercise_completions.length > 0

    return (
        <div className="md:container mx-auto space-y-4">
            {exercise.data.exercise_type === 'essay' && (
                <>
                    <StudentPublicExercisePage
                        exercise={exercise.data}
                        profile={profile.data}
                        isExerciseCompleted={isExerciseCompleted}
                    />
                </>
            )}

            {exercise.data.exercise_type === 'coding_challenge' && (
                <StudentExerciseCodePage
                    exercise={exercise.data as any}
                    isExerciseCompleted={isExerciseCompleted}
                    studentId={params.studentId}
                    readOnly
                >
                    <ViewMarkdown
                        markdown={`\`\`\`typescript\n${lastSubmission?.submission_code}\n
                    
                    `}
                    />
                </StudentExerciseCodePage>
            )}
        </div>
    )
}
