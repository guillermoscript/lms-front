import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconBook,
  IconTemplate,
  IconUsers,
  IconFileText,
  IconEdit,
  IconEye,
  IconChartBar,
  IconCalendar,
  IconArrowRight,
  IconCurrencyDollar,
  IconBolt
} from '@tabler/icons-react'
import * as motion from 'motion/react-client'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { TeacherDashboardTour } from '@/components/tours/teacher-dashboard-tour'

export default async function TeacherDashboard() {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // 1. Get courses first (to avoid complex join errors)
  const { data: coursesData, error: coursesError } = await supabase
    .from('courses')
    .select(`
            *,
            lessons(id),
            exams(exam_id)
        `)
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (coursesError) {
    console.error('Error fetching courses:', coursesError)
  }

  const courses = coursesData || []
  const courseIds = courses.map(c => c.course_id)

  // 2. Fetch other related data in parallel using courseIds
  const [enrollmentsRes, allEnrollmentsRes, submissionsRes, profileRes] = await Promise.all([
    // Recent activity enrollments
    courseIds.length > 0
      ? supabase
        .from('enrollments')
        .select(`
                    enrollment_date,
                    profiles(id, full_name, avatar_url),
                    courses!inner(title)
                `)
        .in('course_id', courseIds)
        .eq('tenant_id', tenantId)
        .order('enrollment_date', { ascending: false })
        .limit(5)
      : Promise.resolve({ data: [] }),

    // Total enrollment count across all courses
    courseIds.length > 0
      ? supabase
        .from('enrollments')
        .select('enrollment_id')
        .in('course_id', courseIds)
        .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),

    // Submissions for these courses
    courseIds.length > 0
      ? supabase
        .from('exam_submissions')
        .select('submission_id, exam_id, exams!inner(course_id)')
        .in('exams.course_id', courseIds)
        .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),

    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
  ])

  const recentEnrollments = enrollmentsRes.data || []
  const totalEnrollmentsList = allEnrollmentsRes.data || []
  const allSubmissions = submissionsRes.data || []
  const profile = profileRes.data

  // Calculate totals
  const totalCourses = courses.length
  const totalStudents = totalEnrollmentsList.length
  const totalLessons = courses.reduce((acc, c) => acc + (c.lessons?.length || 0), 0)
  const totalPendingReviews = allSubmissions.length

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8" data-testid="teacher-dashboard">
      {/* Guided Tour (client component) */}
      <TeacherDashboardTour userId={userId} />

      <div data-tour="teacher-welcome" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground" data-testid="teacher-welcome">
            {t.rich('welcome', {
              userName: profile?.full_name?.split(' ')[0] || t('defaultName')
            })}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/teacher/templates">
            <Button variant="outline" size="sm" className="gap-2">
              <IconTemplate className="h-3.5 w-3.5" />
              {t('promptTemplates')}
            </Button>
          </Link>
          <Link href="/dashboard/teacher/courses/new">
            <Button size="sm" className="gap-2">
              <IconPlus className="h-3.5 w-3.5" />
              {t('createCourse')}
            </Button>
          </Link>
        </div>
      </div>

      <div data-tour="teacher-stats" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
        >
          <Card className="group transition-all duration-200 ring-1 ring-transparent hover:ring-blue-200 hover:shadow-md dark:hover:ring-blue-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.totalCourses')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{totalCourses}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.totalLessons', { count: totalLessons })}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                  <IconBook className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card className="group transition-all duration-200 ring-1 ring-transparent hover:ring-emerald-200 hover:shadow-md dark:hover:ring-emerald-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.activeStudents')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{totalStudents}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.acrossPublished')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <IconUsers className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <Card className="group transition-all duration-200 ring-1 ring-transparent hover:ring-amber-200 hover:shadow-md dark:hover:ring-amber-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.submissions')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{totalPendingReviews}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.totalExams')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <IconFileText className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="group transition-all duration-200 ring-1 ring-transparent hover:ring-violet-200 hover:shadow-md dark:hover:ring-violet-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.quickActions')}</p>
                  <div className="mt-2 flex gap-2">
                    <div className="h-1.5 w-full rounded-full bg-violet-100 dark:bg-violet-950/60 overflow-hidden">
                      <div className="h-full bg-violet-500 w-[65%] rounded-full" />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    {t('stats.platformActivity')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
                  <IconBolt className="h-[18px] w-[18px] text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Getting Started Checklist — shown until dismissed */}
      <OnboardingChecklist
        storageKey={`teacher-${userId}`}
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        steps={[
          {
            id: 'create-course',
            label: t('onboarding.createCourse'),
            description: t('onboarding.createCourseDesc'),
            href: '/dashboard/teacher/courses/new',
            completed: totalCourses > 0,
          },
          {
            id: 'add-lesson',
            label: t('onboarding.addLesson'),
            description: t('onboarding.addLessonDesc'),
            href: courses[0] ? `/dashboard/teacher/courses/${courses[0].course_id}` : '/dashboard/teacher/courses/new',
            completed: totalLessons > 0,
          },
          {
            id: 'publish-course',
            label: t('onboarding.publishCourse'),
            description: t('onboarding.publishCourseDesc'),
            href: courses[0] ? `/dashboard/teacher/courses/${courses[0].course_id}/settings` : '/dashboard/teacher/courses/new',
            completed: courses.some(c => c.status === 'published'),
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Courses Section */}
        <Card data-tour="teacher-courses" className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('courses.title')}</CardTitle>
              <CardDescription>
                {t('courses.description')}
              </CardDescription>
            </div>
            <Link href="/dashboard/teacher/courses">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                {t('courses.viewAll')}
                <IconArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {courses.length > 0 ? (
                courses.map((course, idx) => (
                  <motion.div
                    key={course.course_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * idx, duration: 0.25 }}
                    className="group relative flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                        {course.thumbnail_url ? (
                          <img src={course.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <IconBook className="h-5 w-5 text-primary/60" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">{course.title}</h4>
                        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <IconUsers size={11} /> {course.enrollments?.length || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <IconFileText size={11} /> {t('courses.lessonsCount', { count: course.lessons?.length || 0 })}
                          </span>
                          <Badge
                            variant={course.status === 'published' ? 'default' : 'outline'}
                            className={`text-[9px] h-4 py-0 ${course.status === 'published' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                          >
                            {t(`courses.status.${course.status}`)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/dashboard/teacher/courses/${course.course_id}`}>
                        <Button size="icon-xs" variant="ghost" className="rounded-full" aria-label={t('courses.editCourse')}>
                          <IconEdit size={14} />
                        </Button>
                      </Link>
                      <Link href={`/dashboard/teacher/courses/${course.course_id}/preview`} prefetch={false}>
                        <Button size="icon-xs" variant="ghost" className="rounded-full" aria-label={t('courses.previewCourse')}>
                          <IconEye size={14} />
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <IconBook className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('courses.noCourses')}</p>
                  <Link href="/dashboard/teacher/courses/new">
                    <Button variant="link" size="sm" className="mt-1">{t('courses.createFirst')}</Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('activity.title')}</CardTitle>
            <CardDescription>
              {t('activity.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {recentEnrollments.length > 0 ? (
                recentEnrollments.map((activity: any, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="relative">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden text-xs font-semibold text-primary">
                        {activity.profiles?.avatar_url ? (
                          <img src={activity.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (activity.profiles?.full_name || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        {t.rich('activity.enrolledIn', {
                          userName: (chunks) => <span className="font-medium text-foreground">{activity.profiles?.full_name || t('activity.anonymous')}</span>,
                          courseTitle: (chunks) => <span className="font-medium text-primary">{activity.courses?.title}</span>
                        })}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                        <IconCalendar size={10} />
                        {new Date(activity.enrollment_date).toLocaleDateString()} {t('activity.at')}{' '}
                        {new Date(activity.enrollment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <IconUsers className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('activity.noActivity')}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl bg-primary/[0.04] p-4 ring-1 ring-primary/10">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <IconChartBar size={14} className="text-primary" />
                </div>
                <h4 className="text-sm font-semibold">{t('activity.growthTip')}</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-[38px]">
                {t('activity.growthTipDesc')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
