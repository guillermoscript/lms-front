import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'

export default async function NewCoursePage() {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.newCourse')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get categories for the form
  const { data: categories } = await supabase
    .from('course_categories')
    .select('id, name')
    .order('name')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <CourseForm categories={categories || []} />
      </div>
    </div>
  )
}
