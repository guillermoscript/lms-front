import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { requireCourseAccess } from '@/lib/services/course-access-guard'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BlockedMembers } from '@/components/community/blocked-members'
import { CommunityFeed } from '@/components/community/community-feed'
import { getFeedFocus, getFeedPage } from '@/lib/community/feed'
import { parseQuestionFilter } from '@/lib/community/questions'
import { getCommunitySettings } from '@/lib/community/settings'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'

interface PageProps {
  params: Promise<{ courseId: string }>
  // `?post=<id>` focuses one post of THIS course (#869).
  searchParams: Promise<{ post?: string | string[]; questions?: string | string[] }>
}

export default async function StudentCourseCommunityPage({ params, searchParams }: PageProps) {
  const { courseId } = await params
  const t = await getTranslations('community')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()
  const numericCourseId = parseInt(courseId)

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const adminClient = createAdminClient()

  // Verify access (entitlements model) before reading anything about the course
  await requireCourseAccess(adminClient, userId, numericCourseId)

  const { data: course } = await adminClient
    .from('courses')
    .select('course_id, title')
    .eq('course_id', numericCourseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) {
    notFound()
  }

  // Check plan features for community access
  const { data: planFeatures } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })

  const header = (description?: string, actions?: React.ReactNode) => (
    <PageHeader
      back={{ href: `/dashboard/student/courses/${courseId}`, label: t('courseEntry.backToCourse') }}
      title={`${course.title} — ${t('title')}`}
      description={description}
      actions={actions}
    />
  )

  if (!planFeatures?.features?.community) {
    return (
      <PageShell variant="reading">
        {header()}
        <UpgradeNudge feature="community" currentPlan={planFeatures?.plan} />
      </PageShell>
    )
  }

  const query = await searchParams
  // `?questions=` (#875): questions, unanswered or answered ones.
  const questionFilter = parseQuestionFilter(query.questions)
  const focusPromise = getFeedFocus(query.post, {
    tenantId,
    viewerId: userId,
    scope: 'course',
    courseId: numericCourseId,
  })
  const [feed, settings] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'course', courseId: numericCourseId, questionFilter }),
    getCommunitySettings(tenantId),
  ])
  const focus = await focusPromise

  return (
    <PageShell variant="reading">
      {header(t('courseFeedDescription'), <BlockedMembers />)}
      <CommunityFeed
        key={questionFilter ?? 'all'}
        questionFilter={questionFilter}
        scope="course"
        tenantId={tenantId}
        courseId={numericCourseId}
        initialPosts={feed.posts}
        initialHasMore={feed.hasMore}
        userRole={role as 'student' | 'teacher' | 'admin'}
        userId={userId}
        settings={settings}
        focusPostId={focus.focusPostId}
        focusPost={focus.focusPost}
      />
    </PageShell>
  )
}
