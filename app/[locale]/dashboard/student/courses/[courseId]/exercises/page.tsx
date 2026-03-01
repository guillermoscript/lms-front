import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExerciseCard from '@/components/exercises/exercise-card'
import { IconBarbell } from '@tabler/icons-react'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function ExercisesListPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    // Fetch exercises with completion status and message counts
    const { data: exercises, error } = await supabase
        .from('exercises')
        .select(`
        id, 
        title,
        description,
        exercise_type,
        difficulty_level,
        time_limit,
        courses(title),
        exercise_completions(id),
        exercise_messages(id)
    `)
        .eq('course_id', parseInt(courseId))
        .eq('status', 'published')
        .eq('exercise_completions.user_id', user.id)
        .eq('exercise_messages.user_id', user.id)

    if (error) {
        console.error('Error fetching exercises:', error)
        // Handle case where error might be due to user not being found in related tables 
        // (though in Supabase this filtering often needs careful handling with left joins)
    }

    // Fallback fetch if the filtered query above returns empty due to RLS or Join logic 
    // and we want to show all exercises regardless of completions.
    // The user's query provided actually filters by completions/messages which might be restrictive.
    // We'll stick to the user's logic but handle the empty state gracefully.

    const firstExercise = exercises?.[0];
    const courseData = firstExercise?.courses;
    const courseTitle = (Array.isArray(courseData) ? courseData[0]?.title : (courseData as any)?.title) || "Course";

    const breadcrumbLinks = [
        { href: '/dashboard/student', label: 'Dashboard' },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: '#', label: 'Exercises' },
    ]

    return (
        <div className="container mx-auto py-8 px-4 space-y-8">
            <div className="space-y-4">
                <BreadcrumbComponent links={breadcrumbLinks} />
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <IconBarbell size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Practice Arena</h1>
                        <p className="text-muted-foreground">Challenge yourself with interactive activities and coding tasks.</p>
                    </div>
                </div>
            </div>

            {!exercises || exercises.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-3xl">
                    <IconBarbell className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">No exercises found</h3>
                    <p className="text-muted-foreground text-center max-w-xs mt-2">
                        Looks like there are no active exercises for this course at the moment.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {exercises.map((exercise: any) => (
                        <ExerciseCard
                            key={exercise.id}
                            exercise={exercise}
                            courseId={courseId}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
