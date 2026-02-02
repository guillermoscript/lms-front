import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { DashboardHeader } from '@/components/student/dashboard-header'
import { DashboardSummary } from '@/components/student/dashboard-summary'
import { ActivitySection } from '@/components/student/activity-section'
import { NotificationsSummary } from '@/components/student/notifications-summary'
import { CourseCard } from '@/components/student/course-card'
import { IconRocket, IconBook, IconLayoutDashboard, IconChevronRight, IconArrowRight, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

async function getData(userId: string) {
  const supabase = await createClient()

  const [lessonsView, userChats, subscriptions, notifications] = await Promise.all([
    supabase
      .from('distinct_lesson_views')
      .select(`
                view_id,
                lesson_id,
                viewed_at,
                lesson_title,
                lesson_description,
                lesson_course_id,
                lesson_image,
                lesson_sequence
            `)
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(6),

    supabase.from('chats').select('*').eq('user_id', userId),

    supabase.from('subscriptions').select('subscription_id').eq('user_id', userId),

    supabase.from('notifications').select('*').eq('user_id', userId).eq('read', false).limit(5),
  ])

  const coursesQuery = subscriptions.data?.length
    ? supabase
      .from('courses')
      .select(`
                course_id,
                title,
                enrollments(user_id),
                description,
                thumbnail_url,
                lessons(id, title, lesson_completions(id, user_id)),
                exams(exam_id, title, exam_date)
            `)
      .eq('status', 'published')
      .eq('lessons.lesson_completions.user_id', userId)
      .eq('enrollments.user_id', userId)
    : supabase
      .from('enrollments')
      .select(`
                course_id,
                user_id,
                course:courses(
                    course_id,
                    title,
                    description,
                    thumbnail_url,
                    lessons(id, title, lesson_completions(id, user_id)),
                    exams(exam_id, title, exam_date)
                )
            `)
      .eq('user_id', userId)
      .eq('status', 'active') // Changed 'published' to 'active' for enrollment status
      .eq('course.lessons.lesson_completions.user_id', userId)

  const coursesResult = await coursesQuery

  if (coursesResult.error) throw new Error(coursesResult.error.message)
  if (lessonsView.error) throw new Error(lessonsView.error.message)
  if (userChats.error) throw new Error(userChats.error.message)
  if (notifications.error) throw new Error(notifications.error.message)

  const courses = (coursesResult.data as any[])?.map((course) => {
    const isSubscription = subscriptions.data ? subscriptions.data.length > 0 : false;

    return {
      course_id: course.course_id,
      enrolled: isSubscription ? (course.enrollments?.length > 0) : true,
      course: {
        title: course.title || course.course?.title,
        description: course.description || course.course?.description,
        thumbnail_url: course.thumbnail_url || course.course?.thumbnail_url,
        lessons: course.lessons || course.course?.lessons || [],
        exams: course.exams || course.course?.exams || [],
      },
    };
  }) || []

  return {
    courses,
    lessonsView: lessonsView.data || [],
    userChats: userChats.data || [],
    notifications: notifications.data || [],
  }
}

export default async function StudentDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const data = await getData(user.id)
  const t = await getTranslations('dashboard.student')

  const totalLessonsCompleted = data.courses.reduce((acc, course) => {
    const completedLessons = (course.course.lessons || []).filter((lesson: any) =>
      lesson.lesson_completions && lesson.lesson_completions.length > 0
    ).length
    return acc + completedLessons
  }, 0)

  const totalLessons = data.courses.reduce((acc, course) => {
    return acc + (course.course.lessons?.length || 0)
  }, 0)

  const progressCalc = totalLessons > 0 ? (totalLessonsCompleted / totalLessons) * 100 : 0
  const overallProgress = Number(progressCalc.toFixed(1))

  const nextLesson = data.lessonsView?.[0];

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 pb-20">
      <DashboardHeader user={user} />

      <main className="container mx-auto px-4 md:px-8 py-10 space-y-12 animate-in fade-in duration-700">
        {/* Visual Highlights Summary */}
        <DashboardSummary
          user={user}
          overallProgress={overallProgress}
          completedLessons={totalLessonsCompleted}
          nextLesson={nextLesson}
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 items-start">
          {/* Activity Section - Left Side */}
          <div className="xl:col-span-2 space-y-12">
            {data.lessonsView.length > 0 ? (
              <ActivitySection lessons={data.lessonsView} />
            ) : (
              <section className="bg-card border-none shadow-soft rounded-[32px] p-12 text-center overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <IconRocket className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-black mb-2">{t('emptyStateTitle')}</h3>
                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                  {t('emptyStateDescription')}
                </p>
                <div className="flex justify-center gap-4">
                  <Link href="/">
                    <Button className="rounded-2xl h-12 px-8 font-bold gap-2">
                      Start Exploring
                      <IconArrowRight size={18} />
                    </Button>
                  </Link>
                </div>
              </section>
            )}

            {/* Courses Progress Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                  <h2 className="text-2xl font-black tracking-tight">Your Courses</h2>
                </div>
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                  {data.courses.length} Active Tracks
                </span>
              </div>

              {data.courses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.courses.map((item: any) => {
                    const progress = (item.course.lessons || []).filter((l: any) => l.lesson_completions?.length > 0).length;
                    const total = item.course.lessons?.length || 0;

                    return (
                      <CourseCard
                        key={item.course_id}
                        course={{
                          course_id: item.course_id,
                          title: item.course.title,
                          description: item.course.description,
                          thumbnail_url: item.course.thumbnail_url
                        }}
                        progress={{
                          completedLessons: progress,
                          totalLessons: total
                        }}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="p-10 border-2 border-dashed rounded-3xl text-center text-muted-foreground">
                  Enrolling in a course will track your progress here.
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Side - Notifications & Quick Links */}
          <div className="space-y-10 sticky top-24">
            <NotificationsSummary notifications={data.notifications} />

            {/* Quick Navigation Card */}
            <Card className="border-none shadow-soft rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <IconLayoutDashboard size={20} className="text-indigo-400" />
                  Quick Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-6">
                <Link href="/dashboard/student/profile" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/10 transition-colors group">
                  <span className="text-sm font-bold">My Transcripts</span>
                  <IconChevronRight size={16} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                </Link>
                <Link href="/dashboard/student/settings" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/10 transition-colors group">
                  <span className="text-sm font-bold">Billing & Plans</span>
                  <IconChevronRight size={16} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                </Link>
                <div className="pt-4 px-3">
                  <div className="bg-indigo-500/20 rounded-xl p-4 border border-indigo-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <IconSparkles size={16} className="text-indigo-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">AI Assistant</span>
                    </div>
                    <p className="text-xs text-indigo-100 leading-relaxed">
                      Got questions? Our AI tutor is available in any lesson to help you out!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

