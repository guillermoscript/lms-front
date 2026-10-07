import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
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
    <PageShell variant="form">
      <PageHeader
        back={{ href: '/dashboard/teacher/courses', label: t('back') }}
        title={t('title')}
        description={t('description')}
        actions={
          <Link href="/dashboard/teacher/courses/ai">
            <Button size="sm" variant="outline" className="gap-2">
              <IconSparkles className="h-3.5 w-3.5" />
              {tArchitect('createWithAi')}
            </Button>
          </Link>
        }
      />
      <CourseForm categories={categories || []} />
    </PageShell>
  )
}
