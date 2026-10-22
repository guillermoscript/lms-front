import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getLandingPages } from '@/app/actions/admin/landing-pages'
import { getAllSettingsByCategory } from '@/app/actions/admin/settings'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { LandingPagesClient } from '@/components/admin/landing-page/landing-pages-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUCK_TEMPLATES } from '@/lib/puck/templates'
import { getLandingData } from '@/lib/puck/utils/landing-data'
import { normalizeIntegerId } from '@/lib/puck/utils/collect-bound-ids'
import type { CourseLandingIntent } from '@/components/admin/landing-page/landing-pages-client'
import { getTranslations } from 'next-intl/server'
import { getTenantAiEnabled } from '@/lib/ai/ui-flags'

/**
 * Whether a page is this course's sales page: a CourseHero bound to it, top level or in a zone.
 * Any other binding (an EnrollCta on the homepage, a testimonial filter) doesn't count.
 */
function isCourseSalesPage(data: unknown, courseId: string): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as { content?: unknown; zones?: Record<string, unknown> }
  const items = [d.content, ...Object.values(d.zones ?? {})].flatMap((z) => (Array.isArray(z) ? z : []))
  return items.some(
    (item: { type?: unknown; props?: { courseId?: unknown } }) =>
      item?.type === 'CourseHero' && normalizeIntegerId(item.props?.courseId) === courseId
  )
}

interface PageProps {
  searchParams: Promise<{ newForCourse?: string | string[] }>
}

export default async function LandingPageAdminPage({ searchParams }: PageProps) {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/dashboard/admin')

  const t = await getTranslations('landingPageBuilder')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const tenantId = await getCurrentTenantId()

  // Check plan
  const supabase = createAdminClient()
  const { data: planResult } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })
  const plan = (planResult as { plan?: string } | null)?.plan ?? 'free'

  // "Describe your page" needs a working key; without one the picker offers templates only.
  const aiConfigured = await getTenantAiEnabled()

  const pagesResult = await getLandingPages(tenantId)
  const allRows = pagesResult.success ? (pagesResult.data ?? []) : []
  const pages = allRows.filter((p) => p.kind === 'page')
  const parts = allRows.filter((p) => p.kind !== 'page')

  // `?newForCourse=<id>` (the course page's "Landing page" button): open the page that already
  // sells this course, or create one from the course template. The course is resolved with the
  // rest of the bundle below, so a page from another school's course id never gets created.
  const raw = (await searchParams).newForCourse
  const forCourseId = normalizeIntegerId(Array.isArray(raw) ? raw[0] : raw)
  const courseProbe = forCourseId ? [{ content: [{ type: 'CourseHero', props: { courseId: forCourseId } }] }] : []

  // Resolve the ids every page binds (any of them may be opened in the editor); drafts are
  // included, flagged, so the editor can say "publish this course" instead of going blank.
  const landingData = await getLandingData(tenantId, {
    puckData: [...allRows.map((p) => p.puck_data), ...courseProbe],
    includeDrafts: true,
  })

  const forCourse = forCourseId ? landingData.courseDetails?.[forCourseId] : undefined
  const courseIntent: CourseLandingIntent | null = forCourse
    ? {
        courseId: forCourse.id,
        title: forCourse.title,
        isFree: forCourse.price == null,
        existingPageId:
          pages.find((p) => p.slug !== 'home' && isCourseSalesPage(p.puck_data, forCourse.id))?.id ?? null,
      }
    : null

  // Branding settings so the builder can edit logo/colors inline without leaving
  const settingsResult = await getAllSettingsByCategory()
  const brandingSettings = settingsResult.success ? (settingsResult.data?.general ?? {}) : {}

  return (
    <div className="min-h-screen bg-background">
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <LandingPagesClient
          pages={pages}
          parts={parts}
          plan={plan}
          aiConfigured={aiConfigured}
          tenantId={tenantId}
          templates={PUCK_TEMPLATES}
          brandingSettings={brandingSettings}
          landingData={landingData}
          courseIntent={courseIntent}
        />
      </main>
    </div>
  )
}
