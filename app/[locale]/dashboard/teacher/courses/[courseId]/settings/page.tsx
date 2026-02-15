import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { getUserRole } from '@/lib/supabase/get-user-role'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseSettingsPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tForm = await getTranslations('dashboard.teacher.courseForm')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getUserRole()

  // Get course and verify ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .single()

  if (!course) {
    notFound()
  }

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

  // Get categories for the form
  const { data: categories } = await supabase
    .from('course_categories')
    .select('id, name')
    .order('name')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href={`/dashboard/teacher/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('backToCourses')}
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t('settings')}</h1>
          <p className="mt-2 text-muted-foreground">
            {tForm('descriptionPlaceholder')}
          </p>
        </div>

        <CourseForm
          categories={categories || []}
          initialData={course as any}
        />
      </div>
    </div>
  )
}
