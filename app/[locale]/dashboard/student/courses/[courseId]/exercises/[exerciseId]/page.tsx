import { generateId } from 'ai'

import { getI18n } from '@/app/locales/server'
import ExerciseCard from '@/components/dashboards/exercises/ExerciseCard'
import StudentExerciseCodePage from '@/components/dashboards/exercises/StudentExerciseCodePage'
import StudentExerciseCodeWrapper from '@/components/dashboards/exercises/StudentExerciseCodeWrapper'
import StudentExercisePage from '@/components/dashboards/exercises/StudentExercisePage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExerciseChat from '@/components/dashboards/student/course/exercises/exerciseChat'
import { Card, CardContent } from '@/components/ui/card'
import { URL_OF_SITE } from '@/utils/const'
import { createClient } from '@/utils/supabase/server'

export default async function ExerciseStudentPage({
    params,
}: {
    params: { exerciseId: string; courseId: string }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    const exercise = await supabase
        .from('exercises')
        .select(
            `*,
            courses(title),
            exercise_completions(*),
            exercise_messages(id,message,role,created_at)`
        )
        .eq('id', params.exerciseId)
        .eq('exercise_completions.user_id', userData?.data.user.id)
        .eq('exercise_messages.user_id', userData?.data.user.id)
        .order('created_at', {
            referencedTable: 'exercise_messages',
            ascending: true,
        })
        .single()

    const profile = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userData.data.user.id)
        .single()

    // search for other 3 exercises
    const exercises = await supabase
        .from('exercise_view')
        .select('*,exercise_completions(id),exercise_messages(id)')
        .eq('course_id', params.courseId)
        .neq('id', params.exerciseId)
        .eq('exercise_completions.user_id', userData?.data.user.id)
        .eq('exercise_messages.user_id', userData?.data.user.id)
        .limit(3)

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
        .eq('user_id', userData.data.user.id)
        .order('created_at', { ascending: false })
        .single()

    // Construct the files object for MySandpack
    const files = {}
    exerciseFiles?.forEach((file) => {
        files[file.file_path] = file.content
    })

    console.log(fetchError)

    const t = await getI18n()

    const isExerciseCompleted = exercise.data?.exercise_completions.length > 0

    const initialMessages = [
        {
            id: generateId().toString(),
            role: 'system',
            content: exercise.data?.system_prompt,
        },
        ...exercise.data?.exercise_messages.map((message) => ({
            id: message.id.toString(),
            role: message.role,
            content: message.message,
        })),
    ]

    return (
        <>
            <div className="md:container mx-auto space-y-4">
                <div className="container">
                    <BreadcrumbComponent
                        links={[
                            {
                                href: '/dashboard',
                                label: t('BreadcrumbComponent.dashboard'),
                            },
                            {
                                href: '/dashboard/student',
                                label: t('BreadcrumbComponent.student'),
                            },
                            {
                                href: '/dashboard/student/courses/',
                                label: t('BreadcrumbComponent.course'),
                            },
                            {
                                href: `/dashboard/student/courses/${params.courseId}`,
                                label: exercise.data?.courses.title,
                            },
                            {
                                href: `/dashboard/student/courses/${params.courseId}/exercises`,
                                label: t('BreadcrumbComponent.exercise'),
                            },
                            {
                                href: `/dashboard/student/courses/${params.courseId}/exercises/${params.exerciseId}`,
                                label: exercise.data?.title,
                            },
                        ]}
                    />
                </div>

                {exercise.data.exercise_type === 'essay' && (

                    <StudentExercisePage
                        exercise={exercise.data}
                        exerciseId={params.exerciseId}
                        courseId={params.courseId}
                        isExerciseCompleted={isExerciseCompleted}
                        profile={profile.data}
                        studentId={userData.data.user.id}
                        isExerciseCompletedSection={
                            <>
                                <h3 className="text-lg font-bold">
                                    {t(
                                        'StudentExercisePage.exerciseSuggestionsDescription'
                                    )}
                                </h3>
                                {exercises.data.map((exercise) => {
                                    return (
                                        <ExerciseCard
                                            key={exercise.id}
                                            exercise={exercise as any}
                                            courseId={exercise.course_id as any}
                                            t={t}
                                        />
                                    )
                                })}
                            </>
                        }
                    >
                        <>
                            <Card className=" border-none shadow-none md:border md:shadow ">
                                <CardContent className="p-0">

                                    <ExerciseChat
                                        apiEndpoint={`${URL_OF_SITE}/api/chat/exercises/student/`}
                                        exerciseId={params.exerciseId}
                                        initialMessages={initialMessages as any}
                                        isExerciseCompleted={isExerciseCompleted}
                                        profile={profile.data}
                                    />

                                </CardContent>
                            </Card>
                        </>
                    </StudentExercisePage>
                )}
                {exercise.data.exercise_type === 'coding_challenge' && (
                    <StudentExerciseCodePage
                        exercise={exercise.data}
                        profile={profile.data}
                        isExerciseCompleted={isExerciseCompleted}
                    >
                        <StudentExerciseCodeWrapper
                            exercise={exercise.data}
                            files={files}
                            exerciseId={+params.exerciseId}
                            isExerciseCompleted={isExerciseCompleted}
                            userCode={lastSubmission?.submission_code}

                        />
                    </StudentExerciseCodePage>
                )}
            </div>
        </>
    )
}
