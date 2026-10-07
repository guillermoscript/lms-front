import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import ExerciseBrowseList from '@/components/exercises/exercise-browse-list'
import { IconBarbell } from '@tabler/icons-react'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { requireCourseAccess } from '@/lib/services/course-access-guard'
import { getCheckpointLinkedExerciseIds } from '@/lib/checkpoints/load'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function ExercisesListPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = createAdminClient()
    const t = await getTranslations('exercises.list')
    const tenantId = await getCurrentTenantId()

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    // Entitlement gate (#509) — this list exposes every exercise in the course.
    await requireCourseAccess(supabase, userId, parseInt(courseId))

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
        .eq('exercise_completions.user_id', userId)
        .eq('exercise_messages.user_id', userId)

    if (error) {
        console.error('Error fetching exercises:', error)
    }

    // Exercises embedded as lesson checkpoints are completed inside the
    // lesson flow — hide them here so students don't do them twice.
    const checkpointExerciseIds = await getCheckpointLinkedExerciseIds(supabase, {
        tenantId,
        exerciseIds: (exercises ?? []).map((exercise) => exercise.id),
    })
    const standaloneExercises = (exercises ?? []).filter(
        (exercise) => !checkpointExerciseIds.has(exercise.id)
    )

    const courseTitle = courseData.title

    return (
        <PageShell>
            <PageHeader
                back={{ href: `/dashboard/student/courses/${courseId}`, label: courseTitle }}
                title={t('title')}
                description={t('subtitle')}
            />

            {standaloneExercises.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-3xl">
                    <IconBarbell className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">{t('empty.title')}</h3>
                    <p className="text-muted-foreground text-center max-w-xs mt-2">
                        {t('empty.description')}
                    </p>
                </div>
            ) : (
                <ExerciseBrowseList exercises={standaloneExercises} courseId={courseId} />
            )}
        </PageShell>
    )
}
