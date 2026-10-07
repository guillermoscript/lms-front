import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import dynamic from 'next/dynamic'
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
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewExercisePage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const tEx = await getTranslations('dashboard.teacher.exerciseBuilder')
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) return notFound()

  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  return (
    <PageShell variant="form">
      <PageHeader
        back={{ href: `/dashboard/teacher/courses/${courseId}/exercises`, label: course.title }}
        title={tEx('createExercise')}
      />

      <ExerciseBuilder courseId={parseInt(courseId)} />
    </PageShell>
  )
}
