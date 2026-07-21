import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BrowseCourseCard } from '@/components/student/browse-course-card'
import { CourseSearchBar } from '@/components/shared/course-search-bar'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { IconAlertCircle, IconSparkles, IconTrophy, IconSearch } from '@tabler/icons-react'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAccessibleCourseIds } from '@/lib/services/course-access'
import {
  getPublishedCourses,
  getCourseCategories,
  getActiveSubscriptions,
  getPlanCourses,
} from '@lms/core'

export default async function BrowseCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string }>
}) {
  const { search, category } = await searchParams
  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  // Sanitize search input — strip special characters used in ilike patterns
  const sanitizedSearch = search?.replace(/[%_\\]/g, '') || ''

  // Get authenticated user
  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Parallelize 4 independent queries — shared query logic from @lms/core
  const [{ data: subscriptions }, { data: categories }, { data: courses }, accessibleCourseIds] = await Promise.all([
    getActiveSubscriptions(supabase, userId, tenantId),
    getCourseCategories(supabase, tenantId),
    getPublishedCourses(supabase, tenantId, {
      search: sanitizedSearch || undefined,
      categoryId: category ? Number(category) : undefined,
    }),
    // "Already enrolled" set — entitlements model (any active access source).
    fetchAccessibleCourseIds(supabase, userId),
  ])

  const activeSubscription = subscriptions?.[0]

  // planCourses is conditional on subscription result -- sequential is correct
  let allowedCourseIds: Set<number> | null = null
  if (activeSubscription) {
    const planId = (activeSubscription.plan as any)?.plan_id
    if (planId) {
      const { data: planCourses } = await getPlanCourses(supabase, planId)

      if (planCourses && planCourses.length > 0) {
        allowedCourseIds = new Set(planCourses.map(pc => pc.course_id))
      }
    }
  }

  // Fetch translations
  const t = await getTranslations('dashboard.student.browse')
  const tCourses = await getTranslations('dashboard.student.courses')
  const tSearch = await getTranslations('courseSearch')

  const enrolledCourseIds = accessibleCourseIds

  const hasActiveFilters = sanitizedSearch || category

  return (
    <div className="container mx-auto py-8 px-4 container" data-testid="browse-courses-page">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <IconSparkles className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight truncate" data-testid="browse-title">{t('title')}</h1>
        </div>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Subscription Status */}
      {!activeSubscription ? (
        <Alert className="mb-8 border-amber-500/20 bg-amber-500/10">
          <IconAlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400 font-semibold">
            {t('noSubscriptionTitle')}
          </AlertTitle>
          <AlertDescription className="text-amber-600/90 dark:text-amber-400/90">
            {t('noSubscriptionDesc')}
            <div className="mt-4">
              <Link href="/pricing">
                <Button className="gap-2">
                  <IconTrophy className="w-4 h-4" />
                  {tCourses('viewPlans')}
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-8 border-primary/20 bg-primary/10">
          <IconSparkles className="h-4 w-4 text-primary" />
          <AlertTitle className="font-semibold">{t('activeSubscriptionTitle')}</AlertTitle>
          <AlertDescription>
            {t('activeSubscriptionDesc', {
              planName: (activeSubscription.plan as any)?.plan_name || 'Premium',
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Search & Category Filter */}
      <CourseSearchBar
        categories={categories || []}
        currentSearch={sanitizedSearch}
        currentCategory={category}
      />

      {/* Course Grid */}
      {!courses || courses.length === 0 ? (
        <div className="border rounded-lg p-12 text-center flex flex-col items-center gap-4">
          <div className="p-4 bg-muted/30 rounded-full">
            <IconSearch className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-muted-foreground">
            {hasActiveFilters ? tSearch('noResults') : t('noCoursesAvailable')}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-muted-foreground" data-testid="browse-course-count">
            {t('showingCourses', { count: courses.length })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => {
              const isCoveredByPlan = allowedCourseIds === null || allowedCourseIds.has(course.course_id)

              const enrollmentStatus = enrolledCourseIds.has(course.course_id)
                ? { variant: 'enrolled' as const }
                : activeSubscription && isCoveredByPlan
                  ? { variant: 'enrollable' as const, subscriptionId: activeSubscription.subscription_id }
                  : activeSubscription && !isCoveredByPlan
                    ? { variant: 'not-in-plan' as const }
                    : { variant: 'no-subscription' as const }

              return (
                <BrowseCourseCard
                  key={course.course_id}
                  course={course}
                  enrollmentStatus={enrollmentStatus}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
