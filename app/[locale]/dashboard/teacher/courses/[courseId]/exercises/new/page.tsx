import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExerciseBuilder } from '@/components/teacher/exercise-builder'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function NewExercisePage({ params }: { params: Promise<{ courseId: string }> }) {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tEx = await getTranslations('dashboard.teacher.exerciseBuilder')
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId } = await params

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', courseId)
    .eq('author_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6 lg:py-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
