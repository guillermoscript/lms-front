import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  IconArrowLeft,
  IconBarbell,
  IconBook,
  IconCheck,
  IconClock,
  IconPlayerPlay,
  IconFileText,
} from '@tabler/icons-react'
import { CourseReviews, type Review } from '@/components/student/course-reviews'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const AristotleStudySection = dynamic(
  () => import('@/components/aristotle/aristotle-study-section').then(m => m.AristotleStudySection),
  {
    loading: () => <Skeleton className="h-12 w-full rounded-xl" />,
  }
)
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseOverviewPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('courseDetails')
  const tenantId = await getCurrentTenantId()
  const numericCourseId = parseInt(courseId)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify enrollment + fetch course in parallel
  const [{ data: enrollment }, { data: course, error }] = await Promise.all([
    supabase
      .from('enrollments')
      .select('enrollment_id')
      .eq('user_id', user.id)
      .eq('course_id', numericCourseId)
      .eq('status', 'active')
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('courses')
      .select('course_id, title, description, thumbnail_url, author_id')
      .eq('course_id', numericCourseId)
      .eq('tenant_id', tenantId)
      .single(),
  ])

  if (!enrollment) {
    redirect('/dashboard/student')
  }

  if (error || !course) {
    console.error('Error fetching course:', error)
    notFound()
  }

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
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId),
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
      .eq('user_id', user.id)
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
  ])

  const authorProfile = authorData
  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])
  const totalLessons = lessons?.length || 0
  const completedCount = lessons?.filter((l) => completedLessonIds.has(l.id)).length || 0
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
  const nextLesson = lessons?.find((l) => !completedLessonIds.has(l.id)) || lessons?.[0]
  const examCount = exams?.length || 0
  const exerciseCount = exercises?.length || 0
  const userHasReviewed = !!userReview
  const aristotleEnabled = tutorConfig?.enabled ?? false

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header with course info */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:py-6 md:py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/student"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <IconArrowLeft className="h-4 w-4" />
            {t('backToLearning')}
          </Link>

          <div className="flex flex-col gap-6 md:flex-row md:items-start lg:gap-10">
            {/* Thumbnail */}
            {course.thumbnail_url && (
              <div className="aspect-video w-full shrink-0 overflow-hidden rounded-2xl shadow-lg border md:w-80 lg:w-96">
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex-1 space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <h1 className="text-xl font-black sm:text-2xl md:text-3xl lg:text-4xl tracking-tight leading-tight line-clamp-3">
                  {course.title}
                </h1>

                {authorProfile && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm font-medium">{t('instructor')}</span>
                    <span className="text-sm font-bold text-foreground">
                      {authorProfile.full_name || t('unknownInstructor')}
                    </span>
                  </div>
                )}
              </div>

              {course.description && (
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed line-clamp-3 md:line-clamp-none">
                  {course.description}
                </p>
              )}

              {/* Progress bar */}
              <div className="pt-2 space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-2xl font-black text-primary">{progressPercent}%</span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('courseProgress')}</p>
                  </div>
                  <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md text-muted-foreground">
                    {t('lessonsCount', { count: completedCount + '/' + totalLessons })}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted border p-[2px]">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-3 sm:pt-4">
                {nextLesson && (
                  <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLesson.id}`} className="flex-1">
                    <Button size="lg" className="w-full h-12 md:h-14 text-base sm:text-lg font-bold rounded-xl shadow-md hover:shadow-lg active:shadow-lg transition-all">
                      <IconPlayerPlay className="mr-2 h-5 w-5 sm:h-6 sm:w-6 fill-current" />
                      {completedCount > 0 ? t('continue') : t('startNow')}
                    </Button>
                  </Link>
                )}
                {exerciseCount > 0 && (
                  <Link href={`/dashboard/student/courses/${courseId}/exercises`} className="flex-1">
                    <Button variant="outline" size="lg" className="w-full h-12 md:h-14 text-base sm:text-lg font-bold rounded-xl border-2">
                      <IconBarbell className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
                      {t('exercises', { count: exerciseCount })}
                    </Button>
                  </Link>
                )}
                {examCount > 0 && (
                  <Link href={`/dashboard/student/courses/${courseId}/exams`} className="flex-1">
                    <Button variant="outline" size="lg" className="w-full h-12 md:h-14 text-base sm:text-lg font-bold rounded-xl border-2">
                      <IconFileText className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
                      {t('exams', { count: examCount })}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Lessons list */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-5 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">{t('curriculum')}</h2>
          <Badge variant="outline" className="font-bold border-2">
            {t('lessonsCount', { count: totalLessons })}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {lessons?.map((lesson) => {
            const isCompleted = completedLessonIds.has(lesson.id)

            return (
              <Link
                key={lesson.id}
                href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                className="group"
              >
                <Card className="transition-all hover:border-primary/50 active:border-primary/50 hover:shadow-md rounded-2xl overflow-hidden border-2 border-transparent bg-muted/30">
                  <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 md:p-6">
                    <div
                      className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${isCompleted
                          ? 'bg-emerald-500/20 text-emerald-600'
                          : 'bg-background text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary shadow-sm border'
                        }`}
                    >
                      {isCompleted ? (
                        <IconCheck className="h-6 w-6" />
                      ) : (
                        <span className="text-lg font-black">
                          {lesson.sequence}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base sm:text-lg group-hover:text-primary transition-colors truncate">
                        {lesson.title}
                      </h3>
                      {lesson.description ? (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {lesson.description}
                        </p>
                      ) : (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            <IconClock size={12} />
                            {t('mins', { count: 15 })}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            <IconBook size={12} />
                            {t('videoText')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="hidden sm:block">
                      {isCompleted ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20 font-bold px-3 py-1">
                          {t('completed')}
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" className="font-bold text-primary group-hover:bg-primary group-hover:text-white rounded-lg">
                          {t('study')}
                        </Button>
                      )}
                    </div>
                    <div className="sm:hidden">
                      <IconPlayerPlay className={cn(
                        "h-5 w-5 transition-transform group-hover:scale-110",
                        isCompleted ? "text-emerald-600" : "text-primary"
                      )} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}

          {(!lessons || lessons.length === 0) && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <IconBook className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                {t('noLessons')}
              </p>
            </div>
          )}
        </div>

        {/* Aristotle Study Tab */}
        {aristotleEnabled && (
          <AristotleStudySection courseId={numericCourseId} />
        )}

        {/* Course Reviews */}
        <div className="mt-8">
          <CourseReviews
            courseId={parseInt(courseId)}
            userId={user.id}
            userHasReviewed={userHasReviewed}
            initialReviews={initialReviews}
          />
        </div>
      </main>
    </div>
  )
}
