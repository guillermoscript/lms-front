import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExerciseBuilder } from '@/components/teacher/exercise-builder'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import { getUserRole } from '@/lib/supabase/get-user-role'

interface PageProps {
  params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function EditExercisePage({ params }: PageProps) {
  const { courseId, exerciseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tEx = await getTranslations('dashboard.teacher.exerciseBuilder')
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getUserRole()

  // Verify course ownership and fetch exercise
  const { data: exercise } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', parseInt(exerciseId))
    .eq('course_id', parseInt(courseId))
    .single()

  if (!exercise) return notFound()

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .single()

  if (!course) return notFound()

  const isOwner = course.author_id === user.id
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">{t('accessDenied')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notAuthor')}</p>
        <Link href="/dashboard/teacher/courses" className="mt-4 inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <Link href={`/dashboard/teacher/courses/${courseId}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          {t('backToCourses')}
        </Button>
      </Link>
      <h1 className="text-3xl font-bold mb-6">{tEx('updateExercise')}</h1>
      <ExerciseBuilder
        courseId={parseInt(courseId)}
        initialData={exercise}
      />
    </div>
  )
}
