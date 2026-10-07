import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import {
  IconPlus,
  IconTarget,
} from '@tabler/icons-react'
import ExerciseManageList, { type ManagedExercise } from '@/components/teacher/exercise-manage-list'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function ExercisesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) return notFound()

  const { courseId } = await params

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', courseId)
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  // Fetch exercises
  const { data: exercises } = await supabase
    .from('exercises')
    .select('*, lesson:lessons(title)')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Which exercises are embedded as lesson checkpoints, and in which lessons —
  // editing/deleting one affects those lessons, so surface it on each row.
  const exerciseIds = (exercises ?? []).map((e) => e.id)
  const { data: checkpointRows } = exerciseIds.length
    ? await supabase
        .from('lesson_checkpoints')
        .select('exercise_id, lessons(title)')
        .eq('tenant_id', tenantId)
        .in('exercise_id', exerciseIds)
    : { data: [] as { exercise_id: number; lessons: { title: string } | { title: string }[] | null }[] }

  const checkpointLessonsByExercise = new Map<number, string[]>()
  for (const row of checkpointRows ?? []) {
    const lesson = Array.isArray(row.lessons) ? row.lessons[0] : row.lessons
    if (!lesson?.title) continue
    const titles = checkpointLessonsByExercise.get(row.exercise_id) ?? []
    if (!titles.includes(lesson.title)) titles.push(lesson.title)
    checkpointLessonsByExercise.set(row.exercise_id, titles)
  }

  const rows: ManagedExercise[] = (exercises ?? []).map((exercise) => ({
    id: exercise.id,
    createdAt: exercise.created_at,
    title: exercise.title,
    exercise_type: exercise.exercise_type,
    difficulty_level: exercise.difficulty_level,
    status: exercise.status,
    time_limit: exercise.time_limit,
    lessonTitle: exercise.lesson?.title ?? null,
    checkpointLessons: checkpointLessonsByExercise.get(exercise.id) ?? [],
  }))

  return (
    <PageShell variant="default">
      <PageHeader
        back={{ href: `/dashboard/teacher/courses/${courseId}`, label: course.title }}
        title={t('practice.title')}
        description={t('practice.description')}
        actions={
          <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
            <Button size="sm" className="gap-2">
              <IconPlus className="h-3.5 w-3.5" />
              {t('practice.addExercise')}
            </Button>
          </Link>
        }
      />

      {exercises && exercises.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <IconTarget size={28} className="text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold mb-1.5">{t('practice.noExercises')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              {t('practice.emptyStateDescription')}
            </p>
            <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
              <Button className="gap-2">
                <IconPlus className="h-4 w-4" />
                {t('practice.getStarted')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ExerciseManageList exercises={rows} courseId={courseId} tenantId={tenantId} />
      )}
    </PageShell>
  )
}
