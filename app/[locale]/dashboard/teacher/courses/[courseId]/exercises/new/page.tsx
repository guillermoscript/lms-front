import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExerciseBuilder } from '@/components/teacher/exercise-builder'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'

export default async function NewExercisePage({ params }: { params: Promise<{ courseId: string }> }) {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tEx = await getTranslations('dashboard.teacher.exerciseBuilder')
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId } = await params

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', courseId)
    .eq('author_id', user.id)
    .single()

  if (!course) return notFound()

  return (
    <div className="container mx-auto py-8">
      <Link href={`/dashboard/teacher/courses/${courseId}/exercises`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          {t('backToCourses')}
        </Button>
      </Link>
      <h1 className="text-3xl font-bold mb-6">{tEx('createExercise')}</h1>
      <ExerciseBuilder courseId={parseInt(courseId)} />
    </div>
  )
}
