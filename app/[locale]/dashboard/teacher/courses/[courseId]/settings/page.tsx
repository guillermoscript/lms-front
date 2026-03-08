import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import Link from 'next/link'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { CourseDeleteButton } from '@/components/teacher/course-delete-button'
import { AristotleConfig } from '@/components/teacher/aristotle-config'
import { Separator } from '@/components/ui/separator'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseSettingsPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tForm = await getTranslations('dashboard.teacher.courseForm')
  const tenantId = await getCurrentTenantId()

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
    .eq('tenant_id', tenantId)
    .single()

  if (!course) {
    notFound()
  }

  const isOwner = course.author_id === user.id
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-destructive">{t('accessDenied')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notAuthor')}</p>
        <Link href="/dashboard/teacher/courses" className="mt-4 inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </div>
    )
  }

  // Get categories and Aristotle config in parallel
  const [{ data: categories }, { data: aristotleConfig }] = await Promise.all([
    supabase
      .from('course_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name'),
    supabase
      .from('course_ai_tutors')
      .select('tutor_id, enabled, persona, teaching_approach, boundaries')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <Link href={`/dashboard/teacher/courses/${courseId}`}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('backToCourse')}>
              <IconArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="truncate max-w-[200px]">{course.title}</span>
            <IconChevronRight className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground">{t('settings')}</span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{t('settings')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tForm('descriptionPlaceholder')}
          </p>
        </div>

        <CourseForm
          categories={categories || []}
          initialData={course as any}
        />

        <Separator className="my-8" />

        {/* Aristotle AI Tutor */}
        <AristotleConfig
          courseId={parseInt(courseId)}
          tenantId={tenantId}
          initialConfig={aristotleConfig}
        />

        <Separator className="my-8" />

        {/* Danger Zone */}
        <div className="rounded-lg border border-destructive/30 p-6">
          <h2 className="text-lg font-semibold text-destructive mb-1">{t('dangerZone')}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('dangerZoneDesc')}
          </p>
          <CourseDeleteButton courseId={parseInt(courseId)} courseTitle={course.title} />
        </div>
      </div>
    </div>
  )
}
