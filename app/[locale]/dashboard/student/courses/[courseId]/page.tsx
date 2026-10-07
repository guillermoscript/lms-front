import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBarbell, IconPlayerPlay, IconFileText } from '@tabler/icons-react'
import { LessonExplorer, type StudentLesson } from '@/components/student/lesson-explorer'
import { CourseReviews, type Review } from '@/components/student/course-reviews'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'

const AristotleStudySection = dynamic(
  () => import('@/components/aristotle/aristotle-study-section').then(m => m.AristotleStudySection),
  {
    loading: () => <Skeleton className="h-12 w-full rounded-xl" />,
  }
)
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getTenantAiEnabled } from '@/lib/ai/ui-flags'
import { requireCourseAccess } from '@/lib/services/course-access-guard'
import { getCheckpointLinkedExerciseIds } from '@/lib/checkpoints/load'
import { loadCourseCommunityEntry } from '@/lib/community/access'
import { CourseCommunityEntry } from '@/components/community/course-community-entry'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseOverviewPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
  const t = await getTranslations('courseDetails')
  const tenantId = await getCurrentTenantId()
  const numericCourseId = parseInt(courseId)

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // #677: existence first, so a bad id gets the dashboard 404 instead of the
  // silent bounce `requireCourseAccess` gives a missing entitlement. Course
  // ids are already enumerable through /browse, so this reveals nothing new;
  // the entitlement gate below still runs for every course that exists.
  const { data: course, error } = await supabase
    .from('courses')
    .select('course_id, title, description, thumbnail_url, author_id')
    .eq('course_id', numericCourseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !course) {
    if (error) console.error('Error fetching course:', error)
    notFound()
  }

  // Verify access (entitlements model) before reading anything else about the course
  await requireCourseAccess(supabase, userId, numericCourseId)

  // Fetch all remaining data in parallel
  const [
    { data: authorData },
    { data: lessons },
    { data: completions },
    { data: exams },
    { data: exercises },
    { data: userReview },
    { data: tutorConfig },
    { data: reviewsData },
    communityEntry,
  ] = await Promise.all([
    course.author_id
      ? supabase.from('profiles').select('full_name, avatar_url').eq('id', course.author_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('lessons')
      .select('id, title, sequence, description')
      .eq('course_id', numericCourseId)
      .eq('status', 'published')
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
    supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('user_id', userId),
    supabase
      .from('exams')
      .select('exam_id')
      .eq('course_id', numericCourseId)
      .eq('status', 'published')
      .eq('tenant_id', tenantId),
    supabase
      .from('exercises')
      .select('id')
      .eq('course_id', numericCourseId)
      .eq('status', 'published')
      .eq('tenant_id', tenantId),
    supabase
      .from('reviews')
      .select('review_id')
      .eq('entity_type', 'courses')
      .eq('entity_id', numericCourseId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('course_ai_tutors')
      .select('enabled')
      .eq('course_id', numericCourseId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('reviews')
      .select('review_id, rating, review_text, created_at, user_id')
      .eq('entity_type', 'courses')
      .eq('entity_id', numericCourseId)
      .order('created_at', { ascending: false }),
    // #868: after the access gate above, so only a viewer who can open the
    // course feed ever gets a link to it.
    loadCourseCommunityEntry({ tenantId, viewerId: userId, courseId: numericCourseId }),
  ])

  const authorProfile = authorData
  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])
  const totalLessons = lessons?.length || 0
  const completedCount = lessons?.filter((l) => completedLessonIds.has(l.id)).length || 0
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
  const nextLesson = lessons?.find((l) => !completedLessonIds.has(l.id)) || lessons?.[0]
  const examCount = exams?.length || 0
  // Match the exercises page: checkpoint-embedded exercises live in the lesson flow.
  const checkpointExerciseIds = await getCheckpointLinkedExerciseIds(supabase, {
    tenantId,
    exerciseIds: exercises?.map((e) => e.id) ?? [],
  })
  const exerciseCount = exercises?.filter((e) => !checkpointExerciseIds.has(e.id)).length || 0
  const userHasReviewed = !!userReview
  // BYOK: no school AI key means no study-session entry point (deduped with the layout's call).
  const aristotleEnabled = (tutorConfig?.enabled ?? false) && (await getTenantAiEnabled())

  // Build initial reviews with user profiles
  let initialReviews: Review[] = []
  if (reviewsData && reviewsData.length > 0) {
    const reviewUserIds = reviewsData.map((r) => r.user_id)
    const { data: reviewProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', reviewUserIds)
    const profilesMap = new Map(reviewProfiles?.map((p) => [p.id, p]) || [])
    initialReviews = reviewsData.map((r) => ({
      review_id: r.review_id,
      rating: r.rating,
      review_text: r.review_text,
      created_at: r.created_at,
      user: profilesMap.get(r.user_id) || { full_name: null, username: 'Unknown' },
    }))
  }

  const lessonItems: StudentLesson[] = (lessons ?? []).map((l) => ({
    id: l.id,
    title: l.title ?? '',
    description: l.description,
    sequence: l.sequence ?? 0,
    completed: completedLessonIds.has(l.id),
  }))

  return (
    <PageShell variant="wide">
      <PageHeader
        back={{ href: '/dashboard/student', label: t('backToLearning') }}
        title={course.title}
        description={
          authorProfile && (
            <>
              {t('instructor')}{' '}
              <span className="font-medium text-foreground">
                {authorProfile.full_name || t('unknownInstructor')}
              </span>
            </>
          )
        }
        actions={
          <>
            {exerciseCount > 0 && (
              <Link href={`/dashboard/student/courses/${courseId}/exercises`}>
                <Button size="sm" variant="outline" className="gap-2">
                  <IconBarbell className="h-3.5 w-3.5" />
                  {t('exercises', { count: exerciseCount })}
                </Button>
              </Link>
            )}
            {examCount > 0 && (
              <Link href={`/dashboard/student/courses/${courseId}/exams`}>
                <Button size="sm" variant="outline" className="gap-2">
                  <IconFileText className="h-3.5 w-3.5" />
                  {t('exams', { count: examCount })}
                </Button>
              </Link>
            )}
            {nextLesson && (
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLesson.id}`}>
                <Button size="sm" className="gap-2">
                  <IconPlayerPlay className="h-3.5 w-3.5 fill-current" />
                  {completedCount > 0 ? t('continue') : t('startNow')}
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* Overview: thumbnail, description, progress */}
      <Card>
        <CardContent className="flex flex-col gap-5 md:flex-row md:items-start">
          {course.thumbnail_url && (
            <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg border md:w-64">
              <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-4">
            {course.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{course.description}</p>
            )}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">
                  <span className="text-lg font-semibold tabular-nums text-brand-text">{progressPercent}%</span>{' '}
                  <span className="text-muted-foreground">{t('courseProgress')}</span>
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('lessonsDone', { done: completedCount, total: totalLessons })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            {communityEntry.enabled && (
              <CourseCommunityEntry
                href={`/dashboard/student/courses/${courseId}/community`}
                activity={communityEntry.activity}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('curriculum')}</h2>
        <LessonExplorer lessons={lessonItems} courseId={courseId} />
      </section>

      {aristotleEnabled && <AristotleStudySection courseId={numericCourseId} />}

      <CourseReviews
        courseId={parseInt(courseId)}
        userId={userId}
        userHasReviewed={userHasReviewed}
        initialReviews={initialReviews}
      />
    </PageShell>
  )
}
