import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconSparkles } from '@tabler/icons-react'
import Link from 'next/link'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function NewCoursePage() {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.newCourse')
  const tArchitect = await getTranslations('courseArchitect')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Get categories for the form
  const { data: categories } = await supabase
    .from('course_categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')

  return (
    <div className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/dashboard/teacher/courses">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('back')}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm font-medium text-foreground">{t('title')}</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Link href="/dashboard/teacher/courses/ai">
          <Button size="sm" variant="outline" className="gap-2">
            <IconSparkles className="h-3.5 w-3.5" />
            {tArchitect('createWithAi')}
          </Button>
        </Link>
      </div>

      <CourseForm categories={categories || []} />
    </div>
  )
}
