import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BrowseCourseCard } from '@/components/student/browse-course-card'
import { CourseSearchBar } from '@/components/shared/course-search-bar'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { IconAlertCircle, IconSparkles, IconTrophy, IconSearch } from '@tabler/icons-react'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function BrowseCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string }>
}) {
  const { search, category } = await searchParams
  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()

  // Sanitize search input — strip special characters used in ilike patterns
  const sanitizedSearch = search?.replace(/[%_\\]/g, '') || ''

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Check if user has an active subscription
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select(`
      subscription_id,
      subscription_status,
      end_date,
      plan:plans!subscriptions_plan_id_fkey (
        plan_id,
        plan_name,
        price
      )
    `)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('subscription_status', 'active')
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: false })

  const activeSubscription = subscriptions?.[0]

  // Fetch plan_courses to determine which courses the subscription covers
  let allowedCourseIds: Set<number> | null = null // null = all courses allowed
  if (activeSubscription) {
    const planId = (activeSubscription.plan as any)?.plan_id
    if (planId) {
      const { data: planCourses } = await supabase
        .from('plan_courses')
        .select('course_id')
        .eq('plan_id', planId)

      // If plan_courses has entries, restrict to those; if empty, allow all
      if (planCourses && planCourses.length > 0) {
        allowedCourseIds = new Set(planCourses.map(pc => pc.course_id))
      }
    }
  }

  // Fetch categories for filter pills
  const { data: categories } = await supabase
    .from('course_categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')

  // Build course query with filters
  let query = supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      tags,
      category_id
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('title', { ascending: true })

  // Apply search filter
  if (sanitizedSearch) {
    query = query.or(`title.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`)
  }

  // Apply category filter
  if (category) {
    query = query.eq('category_id', category)
  }

  const { data: courses } = await query

  // Fetch translations
  const t = await getTranslations('dashboard.student.browse')
  const tCourses = await getTranslations('dashboard.student.courses')
  const tSearch = await getTranslations('courseSearch')

  // Fetch user's enrollments to check which courses they're already enrolled in
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  const enrolledCourseIds = new Set(enrollments?.map(e => e.course_id) || [])

  const hasActiveFilters = sanitizedSearch || category

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" data-testid="browse-courses-page">
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
              return (
                <BrowseCourseCard
                  key={course.course_id}
                  course={course}
                  isEnrolled={enrolledCourseIds.has(course.course_id)}
                  hasActiveSubscription={!!activeSubscription}
                  subscriptionId={activeSubscription?.subscription_id}
                  isCoveredByPlan={isCoveredByPlan}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
