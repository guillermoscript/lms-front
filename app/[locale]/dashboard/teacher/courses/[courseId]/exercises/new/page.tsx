import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const ExerciseBuilder = dynamic(
  () => import('@/components/teacher/exercise-builder').then(m => m.ExerciseBuilder),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    ),
  }
)
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewExercisePage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
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
    <div className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('backToCourses')}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate max-w-[200px]">{course.title}</span>
          <IconChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">{tEx('createExercise')}</span>
        </div>
      </div>

      <ExerciseBuilder courseId={parseInt(courseId)} />
    </div>
  )
}
