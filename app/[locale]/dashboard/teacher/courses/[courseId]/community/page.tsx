import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CommunityFeed } from '@/components/community/community-feed'
import { getFeedPage } from '@/lib/community/feed'
import { getCommunitySettings } from '@/lib/community/settings'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function TeacherCourseCommunityPage({ params }: PageProps) {
  const { courseId } = await params
  const t = await getTranslations('community')
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()
  const numericCourseId = parseInt(courseId)

  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const supabase = await createClient()

  // Verify teacher owns the course or is admin
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title, author_id')
    .eq('course_id', numericCourseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) {
    notFound()
  }

  // Only the course author or an admin can access
  if (course.author_id !== userId && role !== 'admin') {
    redirect('/dashboard/teacher')
  }

  // Check plan features for community access
  const { data: planFeatures } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })

  if (!planFeatures?.features?.community) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
            <Link
              href={`/dashboard/teacher/courses/${courseId}`}
              className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconArrowLeft className="h-4 w-4" />
              {t('backToCourse')}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{course.title} — {t('title')}</h1>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <UpgradeNudge feature="community" currentPlan={planFeatures?.plan} />
        </main>
      </div>
    )
  }

  const [feed, settings] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'course', courseId: numericCourseId }),
    getCommunitySettings(tenantId),
  ])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <Link
            href={`/dashboard/teacher/courses/${courseId}`}
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <IconArrowLeft className="h-4 w-4" />
            {t('backToCourse')}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{course.title} — {t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('courseFeedDescription')}</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <CommunityFeed
          scope="course"
          courseId={numericCourseId}
          initialPosts={feed.posts}
          initialHasMore={feed.hasMore}
          userRole={role}
          userId={userId}
          settings={settings}
        />
      </main>
    </div>
  )
}
