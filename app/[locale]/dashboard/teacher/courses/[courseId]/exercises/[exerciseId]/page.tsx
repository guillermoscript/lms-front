import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
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
import { getUserRole } from '@/lib/supabase/get-user-role'
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

  const { data: exercise } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', parseInt(exerciseId))
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!exercise) return notFound()

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
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-destructive mb-2">{t('accessDenied')}</h1>
        <p className="text-muted-foreground">{t('notAuthor')}</p>
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises`} className="mt-6 inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
          <span className="font-medium text-foreground">{tEx('updateExercise')}</span>
        </div>
      </div>

      <ExerciseBuilder
        courseId={parseInt(courseId)}
        initialData={exercise}
      />
    </div>
  )
}
