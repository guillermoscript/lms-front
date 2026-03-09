import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExerciseCard from '@/components/exercises/exercise-card'
import { IconBarbell } from '@tabler/icons-react'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function ExercisesListPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = await createClient()
    const t = await getTranslations('exercises.list')
    const tenantId = await getCurrentTenantId()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    // Fetch course title separately for breadcrumb reliability
    const { data: courseData } = await supabase
        .from('courses')
        .select('title')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()

    if (!courseData) notFound()

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
        .eq('tenant_id', tenantId)
        .eq('exercise_completions.user_id', user.id)
        .eq('exercise_messages.user_id', user.id)

    if (error) {
        console.error('Error fetching exercises:', error)
    }

    const courseTitle = courseData.title

    const breadcrumbLinks = [
        { href: '/dashboard/student', label: t('breadcrumb.dashboard') },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: '#', label: t('breadcrumb.exercises') },
    ]

    return (
        <div className="container mx-auto py-5 sm:py-8 px-4 space-y-6 sm:space-y-8">
            <div className="space-y-3 sm:space-y-4">
                <BreadcrumbComponent links={breadcrumbLinks} />
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <IconBarbell className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
                        <p className="text-muted-foreground">{t('subtitle')}</p>
                    </div>
                </div>
            </div>

            {!exercises || exercises.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-3xl">
                    <IconBarbell className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">{t('empty.title')}</h3>
                    <p className="text-muted-foreground text-center max-w-xs mt-2">
                        {t('empty.description')}
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
