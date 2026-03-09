import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function NewCoursePage() {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.newCourse')
  const tenantId = await getCurrentTenantId()

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
    .eq('tenant_id', tenantId)
    .order('name')

  return (
    <div className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/dashboard/teacher/courses">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Back">
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm font-medium text-foreground">{t('title')}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <CourseForm categories={categories || []} />
    </div>
  )
}
