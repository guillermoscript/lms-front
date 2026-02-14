import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BrowseCourseCard } from '@/components/student/browse-course-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { IconAlertCircle, IconSparkles, IconTrophy } from '@tabler/icons-react'

export default async function BrowseCoursesPage() {
  const supabase = await createClient()

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
    .eq('subscription_status', 'active')
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: false })

  const activeSubscription = subscriptions?.[0]

  // Fetch all published courses
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      tags,
      category_id
    `)
    .eq('status', 'published')
    .order('title', { ascending: true })

  // Fetch translations
  const t = await getTranslations('dashboard.student.browse')
  const tCommon = await getTranslations('common')
  const tCourses = await getTranslations('dashboard.student.courses')

  // Fetch user's enrollments to check which courses they're already enrolled in
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const enrolledCourseIds = new Set(enrollments?.map(e => e.course_id) || [])

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <IconSparkles className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
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
            {t.rich('activeSubscriptionDesc', {
              planName: (activeSubscription.plan as any)?.plan_name || 'Premium',
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Course Grid */}
      {!courses || courses.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">{t('noCoursesAvailable')}</p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-muted-foreground">
            {t('showingCourses', { count: courses.length, s: courses.length === 1 ? '' : 's' })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <BrowseCourseCard
                key={course.course_id}
                course={course}
                isEnrolled={enrolledCourseIds.has(course.course_id)}
                hasActiveSubscription={!!activeSubscription}
                subscriptionId={activeSubscription?.subscription_id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
