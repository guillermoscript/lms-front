import { BookOpen, CreditCard, Edit, GraduationCap } from 'lucide-react'
import { redirect } from 'next/navigation'

import { getScopedI18n } from '@/app/locales/server'
import EditCardProfile from '@/components/dashboards/student/account/EditCardProfile'
import EditProfileDialog from '@/components/dashboards/student/account/EditProfileDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

async function getProfileData(userId: string) {
    const supabase = createClient()

    // Fetch basic profile data
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

    console.log(error)

    // Fetch course completions
    const { count: completedCourses } = await supabase
        .from('lesson_completions')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)

    // Fetch total courses enrolled
    const { count: totalLessons } = await supabase
        .from('lessons')
        .select('*', { count: 'exact' })

    // Fetch recent activity (lesson views and exam views)
    const { data: recentLessonViews } = await supabase
        .from('distinct_lesson_views')
        .select('*')
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(5)

    const { data: recentExamViews } = await supabase
        .from('distinct_exam_views')
        .select('*')
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(5)

    // Fetch active subscription
    const { data: subscription } = await supabase
        .from('subscriptions')
        .select(`
      *,
      plans(
        plan_name,
        price,
        currency
      )
    `)
        .eq('user_id', userId)
        .eq('subscription_status', 'active')
        .single()

    // Fetch transaction history
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(5)

    console.log(completedCourses)

    return {
        profile,
        stats: {
            coursesCompleted: completedCourses || 0,
            totalLessons: totalLessons || 0,
        },
        recentActivity: [
            ...(recentLessonViews || []).map((view) => ({
                id: view.view_id,
                type: 'lesson',
                description: `Viewed lesson: ${view.lesson_title}`,
                date: new Date(view.viewed_at).toLocaleDateString(),
            })),
            ...(recentExamViews || []).map((view) => ({
                id: view.view_id,
                type: 'exam',
                description: `Viewed exam: ${view.exam_title}`,
                date: new Date(view.viewed_at).toLocaleDateString(),
            })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        subscription: subscription
            ? {
                plan: subscription.plans.plan_name,
                status: subscription.subscription_status,
                price: subscription.plans.price,
                currency: subscription.plans.currency,
                nextBilling: new Date(subscription.end_date).toLocaleDateString(),
            }
            : null,
        transactions: transactions?.map((tx) => ({
            id: tx.transaction_id,
            date: new Date(tx.transaction_date).toLocaleDateString(),
            amount: tx.amount,
            status: tx.status,
        })),
    }
}

export default async function EnhancedProfilePage() {
    const t = await getScopedI18n('EnhancedProfilePage')
    const supabase = createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const data = await getProfileData(user.id)

    if (!data.profile) {
        return <div>{t('loading')}</div>
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b">
                <div className="container py-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        <Avatar className="w-24 h-24 border-4 border-primary/10">
                            <AvatarImage src={data.profile.avatar_url} alt={data.profile.full_name} />
                            <AvatarFallback>
                                {data.profile.full_name
                                    ?.split(' ')
                                    .map((n) => n[0])
                                    .join('')}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="flex items-center gap-4">
                                <h1 className="text-3xl font-bold">{data.profile.full_name}</h1>
                                <Badge variant="secondary" className="text-sm">
                                    {t('student')}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1">{user.email}</p>
                            <div className="flex gap-4 mt-4">
                                <EditProfileDialog>
                                    <Button size="sm">
                                        <Edit className="w-4 h-4 mr-2" />
                                        {t('editProfile')}
                                    </Button>
                                </EditProfileDialog>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container py-8">
                <Tabs defaultValue="overview">
                    <TabsList className="grid w-full md:w-fit grid-cols-3 md:grid-cols-4 gap-4">
                        <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
                        <TabsTrigger value="subscription">{t('subscription')}</TabsTrigger>
                        <TabsTrigger value="activity">{t('activity')}</TabsTrigger>
                        <TabsTrigger value="settings">{t('settings')}</TabsTrigger>
                    </TabsList>

                    <div className="mt-6">
                        <TabsContent value="overview" className="space-y-6">
                            {/* Stats Grid */}
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">{t('lessonsCompleted')}</CardTitle>
                                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data.stats.coursesCompleted}</div>
                                        <Progress value={(data.stats.coursesCompleted / data.stats.totalLessons) * 100} className="mt-2" />
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {data.stats.coursesCompleted} {t('of')} {data.stats.totalLessons} {t('lessons')}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">{t('currentPlan')}</CardTitle>
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data.subscription?.plan || t('noPlan')}</div>
                                        {data.subscription && (
                                            <Badge variant="secondary" className="mt-2">
                                                {data.subscription.status}
                                            </Badge>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Recent Activity */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('recentActivity')}</CardTitle>
                                    <CardDescription>{t('recentActivityDesc')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-8">
                                        {data.recentActivity.map((activity) => (
                                            <div key={activity.id} className="flex items-center">
                                                <div className="flex-shrink-0 mr-4">
                                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                        {activity.type === 'lesson' && <BookOpen className="h-5 w-5 text-primary" />}
                                                        {activity.type === 'exam' && <GraduationCap className="h-5 w-5 text-primary" />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <p className="text-sm font-medium leading-none">{activity.description}</p>
                                                    <p className="text-sm text-muted-foreground">{activity.date}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="subscription" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('subscriptionDetails')}</CardTitle>
                                    <CardDescription>{t('subscriptionDetailsDesc')}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <h3 className="font-semibold mb-2">{t('currentPlan')}</h3>
                                            <div className="p-4 rounded-lg border bg-card">
                                                <div className="flex justify-between items-center mb-4">
                                                    <div>
                                                        <p className="font-medium">{data.subscription?.plan || t('noActivePlan')}</p>
                                                        {data.subscription && (
                                                            <p className="text-sm text-muted-foreground">
                                                                {data.subscription.currency === 'usd' ? '$' : '€'}
                                                                {data.subscription.price}/year
                                                            </p>
                                                        )}
                                                    </div>
                                                    {data.subscription && <Badge>{data.subscription.status}</Badge>}
                                                </div>
                                                {data.subscription && (
                                                    <p className="text-sm text-muted-foreground">
                                                        {t('nextBilling')} {data.subscription.nextBilling}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('transactionHistory')}</CardTitle>
                                    <CardDescription>{t('transactionHistoryDesc')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {data.transactions?.map((tx) => (
                                            <div key={tx.id} className="flex items-center justify-between p-4 rounded-lg border">
                                                <div>
                                                    <p className="font-medium">{t('transaction')} #{tx.id}</p>
                                                    <p className="text-sm text-muted-foreground">{tx.date}</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <p className="font-medium">${tx.amount}</p>
                                                    <Badge variant="outline">{tx.status}</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="activity" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('learningActivity')}</CardTitle>
                                    <CardDescription>{t('learningActivityDesc')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-8">
                                        {data.recentActivity.map((activity) => (
                                            <div key={activity.id} className="flex items-center">
                                                <div className="flex-shrink-0 mr-4">
                                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                        {activity.type === 'lesson' && <BookOpen className="h-5 w-5 text-primary" />}
                                                        {activity.type === 'exam' && <GraduationCap className="h-5 w-5 text-primary" />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <p className="text-sm font-medium leading-none">{activity.description}</p>
                                                    <p className="text-sm text-muted-foreground">{activity.date}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="settings" className="space-y-6">
                            <EditCardProfile />
                            {/* New reusable Edit Profile Dialog */}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}
