import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import dynamic from 'next/dynamic'
import { AiSetupGate } from '@/components/ai/ai-setup-gate'
import { AiEditSheet } from '@/components/teacher/course-architect/ai-edit-sheet'
import { PageHeader, PageHeaderSkeleton, PageShell } from '@/components/dashboard/page-shell'
import { ExerciseBuilderSkeleton } from '../_builder-skeleton'

const ExerciseBuilder = dynamic(
  () => import('@/components/teacher/exercise-builder').then(m => m.ExerciseBuilder),
  {
    loading: () => (
      <>
        <PageHeaderSkeleton back description={false} />
        <ExerciseBuilderSkeleton />
      </>
    ),
  }
)
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function EditExercisePage({ params }: PageProps) {
  const { courseId, exerciseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tEx = await getTranslations('dashboard.teacher.exerciseBuilder')
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const role = await getUserRole()

  const { data: storedExercise } = await supabase
    .from('exercises')
    .select(`*, ${GRADING_SECRETS_EMBED}`)
    .eq('id', parseInt(exerciseId))
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!storedExercise) return notFound()
  // The prompt and grading config live in the staff-only side table (#833).
  const exercise = withGradingSecrets(storedExercise)

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  const isOwner = course.author_id === userId
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    return (
      <PageShell variant="reading">
        <h1 className="text-2xl font-bold text-destructive mb-2">{t('accessDenied')}</h1>
        <p className="text-muted-foreground">{t('notAuthor')}</p>
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises`} className="mt-6 inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </PageShell>
    )
  }

  const { data: files } = exercise.exercise_type === 'coding_challenge'
    ? await supabase.from('exercise_files').select('file_path, content').eq('exercise_id', exercise.id)
    : { data: null }
  const previewFiles = Object.fromEntries((files ?? []).map((file) => [file.file_path, file.content ?? '']))

  return (
    <PageShell variant="form">
      <PageHeader
        back={{ href: `/dashboard/teacher/courses/${courseId}/exercises`, label: course.title }}
        title={tEx('updateExercise')}
        actions={<AiSetupGate><AiEditSheet scope={{ type: 'exercise', exerciseId: exercise.id, courseId: parseInt(courseId) }} /></AiSetupGate>}
      />

      <ExerciseBuilder
        courseId={parseInt(courseId)}
        initialData={{ ...exercise, preview_files: previewFiles }}
      />
    </PageShell>
  )
}
