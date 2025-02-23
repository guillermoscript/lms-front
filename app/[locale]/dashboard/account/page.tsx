import { Bell, BookOpen, CreditCard, Edit, Globe, GraduationCap, Lock, Settings, User } from 'lucide-react'
import { redirect } from 'next/navigation'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

async function getProfileData(userId: string) {
    const supabase = createClient()

    // Fetch basic profile data
    const { data: profile } = await supabase.from('profiles').select('*, user_roles(role)').eq('id', userId).single()

    // Fetch course completions
    const { count: completedCourses } = await supabase
        .from('lesson_completions')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)

    // Fetch total courses enrolled
    const { count: totalCourses } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)

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

    return {
        profile,
        stats: {
            coursesCompleted: completedCourses || 0,
            totalCourses: totalCourses || 0,
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
    const supabase = createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const data = await getProfileData(user.id)

    if (!data.profile) {
        return <div>Loading...</div>
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
                                    {data.profile.user_roles?.role || 'Student'}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1">{user.email}</p>
                            <div className="flex gap-4 mt-4">
                                <Button size="sm">
                                    <Edit className="w-4 h-4 mr-2" />
                  Edit Profile
                                </Button>
                                <Button size="sm" variant="outline">
                                    <Settings className="w-4 h-4 mr-2" />
                  Settings
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container py-8">
                <Tabs defaultValue="overview">
                    <TabsList className="grid w-full md:w-fit grid-cols-3 md:grid-cols-4 gap-4">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="subscription">Subscription</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <div className="mt-6">
                        <TabsContent value="overview" className="space-y-6">
                            {/* Stats Grid */}
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Courses Completed</CardTitle>
                                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data.stats.coursesCompleted}</div>
                                        <Progress value={(data.stats.coursesCompleted / data.stats.totalCourses) * 100} className="mt-2" />
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {data.stats.coursesCompleted} of {data.stats.totalCourses} courses
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data.subscription?.plan || 'No Plan'}</div>
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
                                    <CardTitle>Recent Activity</CardTitle>
                                    <CardDescription>Your latest learning activities</CardDescription>
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
                                    <CardTitle>Subscription Details</CardTitle>
                                    <CardDescription>Manage your subscription and billing</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <h3 className="font-semibold mb-2">Current Plan</h3>
                                            <div className="p-4 rounded-lg border bg-card">
                                                <div className="flex justify-between items-center mb-4">
                                                    <div>
                                                        <p className="font-medium">{data.subscription?.plan || 'No Active Plan'}</p>
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
                            Next billing date: {data.subscription.nextBilling}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Transaction History</CardTitle>
                                    <CardDescription>View your past transactions</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {data.transactions?.map((tx) => (
                                            <div key={tx.id} className="flex items-center justify-between p-4 rounded-lg border">
                                                <div>
                                                    <p className="font-medium">Transaction #{tx.id}</p>
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
                                    <CardTitle>Learning Activity</CardTitle>
                                    <CardDescription>Track your progress and achievements</CardDescription>
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
                            <Card>
                                <CardHeader>
                                    <CardTitle>Profile Settings</CardTitle>
                                    <CardDescription>Manage your account preferences</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-6">
                                        <div className="space-y-2">
                                            <h3 className="font-semibold">Account</h3>
                                            <div className="grid gap-4">
                                                <div className="flex items-center justify-between p-4 rounded-lg border">
                                                    <div className="flex items-center gap-4">
                                                        <User className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium">Personal Information</p>
                                                            <p className="text-sm text-muted-foreground">Update your personal details</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost">Edit</Button>
                                                </div>
                                                <div className="flex items-center justify-between p-4 rounded-lg border">
                                                    <div className="flex items-center gap-4">
                                                        <Lock className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium">Password</p>
                                                            <p className="text-sm text-muted-foreground">Change your password</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost">Update</Button>
                                                </div>
                                            </div>
                                        </div>
                                        <Separator />
                                        <div className="space-y-2">
                                            <h3 className="font-semibold">Preferences</h3>
                                            <div className="grid gap-4">
                                                <div className="flex items-center justify-between p-4 rounded-lg border">
                                                    <div className="flex items-center gap-4">
                                                        <Bell className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium">Notifications</p>
                                                            <p className="text-sm text-muted-foreground">Manage notification settings</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost">Configure</Button>
                                                </div>
                                                <div className="flex items-center justify-between p-4 rounded-lg border">
                                                    <div className="flex items-center gap-4">
                                                        <Globe className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium">Language & Region</p>
                                                            <p className="text-sm text-muted-foreground">Set your language preferences</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost">Change</Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}
