import { ArrowRight, BookOpen, LayoutDashboard, MessageSquare, Trophy } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getI18n } from '@/app/locales/server'
import { CourseCard, RecentActivityCard, StatCard } from '@/components/dashboards/student/course/enhanced-student-dashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

async function getData(userId: string) {
    const supabase = createClient()

    const [lessonsView, userChats, subscriptions, notifications] = await Promise.all([
        supabase
            .from('distinct_lesson_views')
            .select(`
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
        lessons(id, title, lesson_completions(id,user_id)),
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
        course:course_id(
          title,
          description,
          thumbnail_url,
          lessons(id, title, lesson_completions(id,user_id)),
          exams(exam_id, title, exam_date)
        )
      `)
            .eq('user_id', userId)
            .eq('status', 'published')
            .eq('course.course_id.lessons.lesson_completions.user_id', userId)

    const coursesResult = await coursesQuery

    if (coursesResult.error) throw new Error(coursesResult.error.message)
    if (lessonsView.error) throw new Error(lessonsView.error.message)
    if (userChats.error) throw new Error(userChats.error.message)
    if (notifications.error) throw new Error(notifications.error.message)

    const courses = coursesResult.data?.map((course) => ({
        course_id: course.course_id,
        enrolled: subscriptions.data?.length ? course.enrollments?.length > 0 : true,
        course: {
            title: course.title || course.course.title,
            description: course.description || course.course.description,
            thumbnail_url: course.thumbnail_url || course.course.thumbnail_url,
            lessons: course.lessons || course.course.lessons,
            exams: course.exams || course.course.exams,
        },
    }))

    return {
        courses,
        lessonsView: lessonsView.data,
        userChats: userChats.data,
        notifications: notifications.data,
    }
}

export default async function DashboardPage() {
    const supabase = createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const data = await getData(user.id)
    const t = await getI18n()

    const totalLessonsCompleted = data.courses?.reduce((acc, course) => {
        const completedLessons = course.course.lessons.filter((lesson: any) => lesson.lesson_completions?.length > 0).length
        return acc + completedLessons
    }, 0)

    const totalLessons = data.courses?.reduce((acc, course) => {
        return acc + course.course.lessons.length
    }, 0)

    const overallProgress = ((totalLessonsCompleted / totalLessons) * 100).toFixed(1)

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 container">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('DashboardPage.welcomeTitle')}</h1>
                    <p className="text-muted-foreground">{t('DashboardPage.overviewDescription')}</p>
                </div>
                <div className="flex gap-2">
                    {/* <Button>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {t('DashboardPage.viewCalendar')}
                    </Button> */}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={t('DashboardPage.totalProgress')}
                    value={`${overallProgress}%`}
                    description={t('DashboardPage.totalProgressDescription', {
                        completedLessons: totalLessonsCompleted,
                        totalLessons
                    })}
                    icon={Trophy}
                />
                <StatCard
                    title={t('DashboardPage.activeCourses')}
                    value={data.courses?.length || 0}
                    description={t('DashboardPage.activeCoursesDescription', {
                        enrollments: data.courses?.filter((c) => c.enrolled).length || 0
                    })}
                    icon={LayoutDashboard}
                />
                <StatCard
                    title={t('DashboardPage.recentViews')}
                    value={data.lessonsView?.length || 0}
                    description={t('DashboardPage.recentViewsDescription')}
                    icon={BookOpen}
                />
                <StatCard
                    title={t('DashboardPage.messages')}
                    value={data.userChats?.length || 0}
                    description={t('DashboardPage.messagesDescription')}
                    icon={MessageSquare}
                />
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="overview">{t('DashboardPage.overview')}</TabsTrigger>
                    <TabsTrigger value="courses">{t('DashboardPage.courses')}</TabsTrigger>
                    <TabsTrigger value="activity">{t('DashboardPage.activity')}</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <div className="grid gap-6">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-semibold">{t('DashboardPage.continueLearning')}</h2>
                                    <p className="text-sm text-muted-foreground"> {/* you may add a translation here if desired */} </p>
                                </div>
                                <Button variant="ghost" asChild>
                                    <Link href="/dashboard/student/courses">
                                        {t('DashboardPage.viewAllCourses')}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {data.courses?.slice(0, 3).map((course) => (
                                    <CourseCard t={t} key={course.course_id} course={course} />
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('DashboardPage.recentViews')}</CardTitle>
                                    <CardDescription>{t('DashboardPage.recentViewsDescription')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[400px] pr-4">
                                        <div className="space-y-4">
                                            {data.lessonsView?.map((activity) => (
                                                <RecentActivityCard t={t} key={activity.lesson_id} activity={activity} />
                                            ))}
                                        </div>
                                        <ScrollBar />
                                    </ScrollArea>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('DashboardPage.upcomingExams') || 'Upcoming Exams'}</CardTitle>
                                    <CardDescription>Your scheduled examinations</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[400px] pr-4">
                                        <div className="space-y-4">
                                            {data.courses?.flatMap((course) =>
                                                course.course.exams
                                                    ?.filter((exam: any) => new Date(exam.exam_date) > new Date())
                                                    .map((exam: any) => (
                                                        <Card key={exam.exam_id}>
                                                            <CardContent className="pt-6">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h4 className="font-semibold">{exam.title}</h4>
                                                                        <p className="text-sm text-muted-foreground">{course.course.title}</p>
                                                                    </div>
                                                                    <div className="text-sm text-muted-foreground">
                                                                        {new Date(exam.exam_date).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ))
                                            )}
                                        </div>
                                        <ScrollBar />
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="courses">
                    <div className="grid gap-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">{t('DashboardPage.myCourses')}</h2>
                                <p className="text-sm text-muted-foreground">{t('DashboardPage.myCoursesDescription')}</p>
                            </div>
                            <Button>
                                <BookOpen className="mr-2 h-4 w-4" />
                                {t('DashboardPage.browseCourses')}
                            </Button>
                        </div>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {data.courses?.map((course) => (
                                <CourseCard t={t} key={course.course_id} course={course} />
                            ))}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="activity">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('DashboardPage.learningActivity')}</CardTitle>
                            <CardDescription>{t('DashboardPage.learningActivityDescription')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[600px] pr-4">
                                <div className="space-y-4">
                                    {data.lessonsView?.map((activity) => (
                                        <RecentActivityCard t={t} key={activity.lesson_id} activity={activity} />
                                    ))}
                                </div>
                                <ScrollBar />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
