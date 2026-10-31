import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageShell } from '@/components/dashboard/page-shell'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import { ChallengePageClient } from '@/components/challenges/challenge-page-client'
import { loadChallengePage } from '@/lib/challenges/public-page'
import { challengeHeadline } from '@/lib/challenges/headline'
import { findNextExercise } from '@/lib/challenges/claim'
import { publicChallengePath } from '@/lib/challenges/routes'
import { isActiveMember, loadChallengeView } from '@/lib/challenges/view-data'
import { hasCourseAccess } from '@/lib/services/course-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string; locale: string }>
  searchParams: Promise<{ claimed?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, locale } = await params
  const tenantId = await getCurrentTenantId()
  const data = await loadChallengePage(token, tenantId)
  if (!data) return { robots: { index: false, follow: false } }
  const t = await getTranslations({ locale, namespace: 'challenges.page' })
  return { title: challengeHeadline(t, data), robots: { index: false, follow: false } }
}

/**
 * A challenge link opened by a signed-in student, inside the dashboard shell.
 * Same loaders and components as the public landing (`/reto/<token>`), which
 * sends members here. proxy.ts keeps non-students out of /dashboard/student.
 */
export default async function MemberChallengePage({ params, searchParams }: Props) {
  const [{ token }, { claimed }] = await Promise.all([params, searchParams])
  const tenantId = await getCurrentTenantId()
  const [data, userId] = await Promise.all([loadChallengePage(token, tenantId), getCurrentUserId()])
  if (!data) notFound()
  if (!userId) redirect('/auth/login')
  // A session without an active membership is a guest: the public page runs the claim/join flow.
  if (!(await isActiveMember(tenantId, userId))) redirect(publicChallengePath(token))

  const admin = createAdminClient()
  const view = await loadChallengeView({ tenantId, exerciseId: data.exercise.id, userId, viewerIsMember: true })
  const isOwner = Boolean(data.challenger?.userId && data.challenger.userId === userId)

  // Breadcrumb Course > Exercise > Reto, only where the student can open those pages.
  const [t, tList, { data: exercise }] = await Promise.all([
    getTranslations('challenges.student'),
    getTranslations('exercises.list'),
    admin.from('exercises').select('course_id').eq('id', data.exercise.id).eq('tenant_id', tenantId).maybeSingle(),
  ])
  const courseId = exercise?.course_id ?? null
  const entitled = courseId !== null && (await hasCourseAccess(admin, userId, courseId))
  let courseTitle = view.course?.title ?? null
  if (entitled && !courseTitle) {
    const { data: course } = await admin.from('courses').select('title').eq('course_id', courseId).eq('tenant_id', tenantId).maybeSingle()
    courseTitle = course?.title ?? null
  }
  const links =
    entitled && courseId !== null && courseTitle
      ? [
          { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
          { href: `/dashboard/student/courses/${courseId}/exercises/${data.exercise.id}`, label: data.exercise.title },
          { href: '#', label: t('breadcrumbChallenge') },
        ]
      : [
          { href: '/dashboard/student', label: tList('breadcrumb.dashboard') },
          { href: '/dashboard/student/challenges', label: t('title') },
          { href: '#', label: data.exercise.title },
        ]

  // After a claim on a free course, offer the next exercise (the access was granted by the claim).
  const justClaimed = claimed === '1' && Boolean(view.played)
  const nextExerciseId =
    justClaimed && view.course?.isFree ? await findNextExercise(admin, tenantId, view.course.id, data.exercise.id) : null

  return (
    <PageShell variant="reading">
      <BreadcrumbComponent links={links} />
      <ChallengePageClient
        variant="member"
        claimed={justClaimed}
        claimedNext={nextExerciseId && view.course ? { courseId: view.course.id, exerciseId: nextExerciseId } : null}
        token={data.link.token}
        exerciseId={data.exercise.id}
        title={data.exercise.title}
        instructions={data.exercise.instructions}
        passingScore={data.exercise.passingScore}
        creatorName={data.creatorName}
        challenger={data.challenger ? { score: data.challenger.score, passed: data.challenger.passed, name: data.challenger.name } : null}
        isOwner={isOwner}
        viewerIsMember
        rankingEntries={view.rankingEntries}
        course={view.course}
        viewerId={userId}
        played={view.played}
      />
    </PageShell>
  )
}
