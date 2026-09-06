import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { AiCourseGenerator } from '@/components/admin/ai-course-generator'
import { QuickProductCreate } from '@/components/admin/quick-product-create'
import { checkCourseLimit } from '@/app/actions/teacher/courses'
import { getCurrentUserId } from '@/lib/supabase/tenant'

// AI starter-course generation (issue #441) runs as a server action invoked
// from this segment; give it headroom beyond the default function timeout.
export const maxDuration = 60

/**
 * The single "create a course" entry point for school admins (#665).
 *
 * Every admin surface that offers course creation (sidebar, Courses page,
 * getting-started checklist, onboarding wizard) lands here. Quick create
 * makes the course and its offering in one screen and drops the admin into
 * the course editor so the next step — adding lessons — is right there.
 * The full product wizard (existing course, providers, after-purchase steps)
 * stays at /dashboard/admin/products/new for the monetization context.
 */
export default async function AdminNewCoursePage() {
  const t = await getTranslations('dashboard.admin.courses.new')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const limitInfo = await checkCourseLimit()

  return (
    <div className="min-h-screen bg-background" data-testid="admin-new-course-page">
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('courses'), href: '/dashboard/admin/courses' },
                { label: tBreadcrumbs('newCourse') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
        <QuickProductCreate limitInfo={limitInfo} />
        <div className="mx-auto my-6 flex w-full max-w-xl items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase text-muted-foreground">{t('or')}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <AiCourseGenerator disabled={!limitInfo.canCreate} className="mx-auto w-full max-w-xl" />
      </main>
    </div>
  )
}
