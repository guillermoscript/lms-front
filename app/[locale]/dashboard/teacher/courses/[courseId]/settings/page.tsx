import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CourseForm } from '@/components/teacher/course-form'
import { Button } from '@/components/ui/button'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import Link from 'next/link'
import { getUserRole } from '@/lib/supabase/get-user-role'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { CourseDeleteButton } from '@/components/teacher/course-delete-button'
import { AristotleConfig } from '@/components/teacher/aristotle-config'
import { buildAristotleProviders } from '@/lib/ai/aristotle-model-state'
import { SequentialCompletionToggle } from '@/components/teacher/sequential-completion-toggle'
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

  const userId = await getCurrentUserId()
  if (!userId) {
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

  const isOwner = course.author_id === userId
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    return (
      <PageShell variant="form">
        <h1 className="text-2xl font-bold text-destructive">{t('accessDenied')}</h1>
        <p className="text-muted-foreground">{t('notAuthor')}</p>
        <Link href="/dashboard/teacher/courses" className="inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </PageShell>
    )
  }

  // Get categories and Aristotle config in parallel
  const [{ data: categories }, { data: aristotleConfig }, aristotleProviders] = await Promise.all([
    supabase
      .from('course_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name'),
    supabase
      .from('course_ai_tutors')
      .select('tutor_id, enabled, persona, teaching_approach, boundaries, model_config, provider, model')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single(),
    // Ownership is established above; reuses this page's reads instead of re-authorizing in an action.
    buildAristotleProviders(tenantId),
  ])

  return (
    <PageShell variant="form">
      <PageHeader
        back={{ href: `/dashboard/teacher/courses/${courseId}`, label: course.title }}
        title={t('settings')}
        description={tForm('descriptionPlaceholder')}
      />

      <CourseForm
        categories={categories || []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={course as any}
      />

      <Separator />

      {/* Sequential Completion */}
      <SequentialCompletionToggle
        courseId={parseInt(courseId)}
        initialValue={course.require_sequential_completion ?? false}
      />

      <Separator />

      {/* Aristotle AI Tutor */}
      <AristotleConfig
        courseId={parseInt(courseId)}
        tenantId={tenantId}
        initialConfig={aristotleConfig}
        modelState={{
          providers: aristotleProviders,
          current:
            aristotleConfig?.provider && aristotleConfig.model
              ? { provider: aristotleConfig.provider, model: aristotleConfig.model }
              : null,
        }}
      />

      <Separator />

      {/* Danger Zone */}
      <div className="rounded-lg border border-destructive/30 p-6">
        <h2 className="text-lg font-semibold text-destructive mb-1">{t('dangerZone')}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('dangerZoneDesc')}
        </p>
        <CourseDeleteButton courseId={parseInt(courseId)} courseTitle={course.title} />
      </div>
    </PageShell>
  )
}
