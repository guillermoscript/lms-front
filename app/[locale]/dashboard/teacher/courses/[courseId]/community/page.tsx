import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
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

export default async function TeacherCourseCommunityPage({ params, searchParams }: PageProps) {
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

  const header = (description?: string) => (
    <PageHeader
      back={{ href: `/dashboard/teacher/courses/${courseId}`, label: t('courseEntry.backToCourse') }}
      title={`${course.title} — ${t('title')}`}
      description={description}
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
      {header(t('courseFeedDescription'))}
      <CommunityFeed
        key={questionFilter ?? 'all'}
        questionFilter={questionFilter}
        scope="course"
        tenantId={tenantId}
        courseId={numericCourseId}
        initialPosts={feed.posts}
        initialHasMore={feed.hasMore}
        userRole={role}
        userId={userId}
        settings={settings}
        focusPostId={focus.focusPostId}
        focusPost={focus.focusPost}
      />
    </PageShell>
  )
}
