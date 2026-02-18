import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    IconHistory,
    IconSettings,
    IconCheck,
    IconCrown,
    IconEdit,
    IconTrophy,
    IconChartBar,
    IconAward,
} from "@tabler/icons-react"
import { ProfileForm } from '@/components/student/profile-form'
import { cn } from "@/lib/utils"
import { XPProgressCircle } from '@/components/gamification/xp-progress-circle'
import { AchievementGrid } from '@/components/gamification/achievement-grid'
import { StreakCalendar } from '@/components/gamification/streak-calendar'
import { ProfileGamificationStats } from '@/components/gamification/profile-stats'
import Link from 'next/link'
import { StudentCertificateCard } from '@/components/student/student-certificate-card'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

async function getProfileData(userId: string, tenantId: string) {
    const supabase = await createClient()

    const [profileRes, subscriptionRes, transactionsRes, certificatesRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('*, user_roles(role)')
            .eq('id', userId)
            .single(),
        supabase
            .from('subscriptions')
            .select(`
                *,
                plans(
                    plan_name,
                    price,
                    currency,
                    features
                )
            `)
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('subscription_status', 'active')
            .maybeSingle(),
        supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .order('transaction_date', { ascending: false })
            .limit(10),
        supabase
            .from('certificates')
            .select(`
                *,
                courses(title),
                course_certificates_templates:certificate_templates(*)
            `)
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .order('issued_at', { ascending: false })
    ])

    return {
        profile: profileRes.data,
        subscription: subscriptionRes.data,
        transactions: transactionsRes.data || [],
        certificates: certificatesRes.data || []
    }
}

export default async function ProfilePage() {
    const tenantId = await getCurrentTenantId()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    const { profile, subscription, transactions, certificates } = await getProfileData(user.id, tenantId)
    const userInitial = profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"

    const t = await getTranslations('dashboard.student.profile')

    const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
    const currencyFormatter = (amount: number, currency: string) =>
        new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)

    return (
        <div className="min-h-screen bg-background pb-20" data-testid="profile-page">
            <main className="container mx-auto px-4 md:px-8 py-8 md:py-12">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-black tracking-tight text-balance">{t('editProfile')}</h1>
                    <p className="text-muted-foreground mt-1">{t('editProfileSubtitle')}</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar */}
                    <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-6">
                        {/* Profile Card */}
                        <Card className="border border-border overflow-hidden">
                            <div className="h-24 bg-gradient-to-r from-primary/80 to-primary" />
                            <CardContent className="px-6 pb-6 pt-0 -mt-12 text-center relative">
                                <Avatar className="h-24 w-24 mx-auto border-4 border-background shadow-xl">
                                    <AvatarImage src={profile?.avatar_url} alt={profile?.full_name || 'Profile'} />
                                    <AvatarFallback className="text-2xl font-black bg-primary/10 text-primary">
                                        {userInitial}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="mt-3 space-y-1">
                                    <h2 className="text-xl font-black tracking-tight truncate">{profile?.full_name || 'Student'}</h2>
                                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                    <div className="flex justify-center gap-2 pt-1">
                                        {profile?.user_roles?.map((ur: any) => (
                                            <Badge key={ur.role} variant="secondary" className="uppercase tracking-widest text-[10px] font-bold">
                                                {ur.role}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 gap-4">
                                    <div className="text-center">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t('signedUp')}</p>
                                        <p className="font-bold text-sm">{dateFormatter.format(new Date(user.created_at))}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t('userStatus')}</p>
                                        <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5 font-bold">
                                            {t('active')}
                                        </Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Gamification Stats Card */}
                        <Card className="border border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <IconChartBar size={16} />
                                    {t('learningStats')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex justify-center py-4">
                                    <XPProgressCircle size={140} strokeWidth={10} />
                                </div>
                                <ProfileGamificationStats />
                                <StreakCalendar />
                            </CardContent>
                        </Card>

                        {/* Subscription Card */}
                        <Card className="border-none bg-gradient-to-br from-primary/90 to-primary text-primary-foreground overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 motion-safe:group-hover:scale-110 transition-transform duration-500">
                                <IconCrown size={80} />
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <IconCrown size={18} className="text-amber-300" />
                                    {t('currentPlan')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {subscription ? (
                                    <>
                                        <div>
                                            <h3 className="text-xl font-black">{subscription.plans?.plan_name}</h3>
                                            <p className="text-primary-foreground/70 text-xs font-medium">
                                                {t('renewsOn', { date: dateFormatter.format(new Date(subscription.end_date)) })}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            {subscription.plans?.features?.split(',').slice(0, 3).map((f: string, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-sm text-primary-foreground/80">
                                                    <IconCheck size={14} className="text-emerald-300 shrink-0" />
                                                    <span className="line-clamp-1">{f.trim()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <Button variant="secondary" className="w-full rounded-xl h-10 font-bold">
                                            {t('manageSubscription')}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-primary-foreground/70">{t('noActiveSubscription')}</p>
                                        <Link href="/pricing">
                                            <Button variant="secondary" className="w-full rounded-xl h-10 font-bold">
                                                {t('viewPlans')}
                                            </Button>
                                        </Link>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0 space-y-8">
                        {/* Account Settings Form */}
                        <Card className="border border-border">
                            <CardHeader className="border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <IconSettings size={20} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-bold">{t('accountDetails')}</CardTitle>
                                        <p className="text-sm text-muted-foreground">{t('accountDetailsSubtitle')}</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <ProfileForm profile={profile} />
                            </CardContent>
                        </Card>

                        {/* Billing History */}
                        <Card className="border border-border overflow-hidden">
                            <CardHeader className="border-b border-border">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                            <IconHistory size={20} />
                                        </div>
                                        <CardTitle className="text-lg font-bold">{t('billingHistory')}</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="font-bold text-xs">
                                        {t('records', { count: transactions.length })}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {transactions.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-muted/30">
                                                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('id')}</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('date')}</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('amount')}</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('status')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {transactions.map((tx: any) => (
                                                    <tr key={tx.transaction_id} className="hover:bg-muted/10 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-medium text-muted-foreground tabular-nums">#{tx.transaction_id}</td>
                                                        <td className="px-6 py-4 text-sm font-medium">{dateFormatter.format(new Date(tx.transaction_date))}</td>
                                                        <td className="px-6 py-4 text-sm font-bold text-foreground tabular-nums">
                                                            {currencyFormatter(tx.amount, tx.currency)}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Badge variant="outline" className={cn(
                                                                "font-bold uppercase text-[10px]",
                                                                tx.status === 'successful'
                                                                    ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                                                                    : tx.status === 'pending'
                                                                        ? "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/5"
                                                                        : "text-muted-foreground border-border"
                                                            )}>
                                                                {tx.status}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-12 text-center text-muted-foreground">
                                        {t('noTransactions')}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Certificates Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <IconAward size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('certificates.title')}</h2>
                                        {certificates.length > 0 && (
                                            <p className="text-sm text-muted-foreground">
                                                {t('certificates.subtitle', { count: certificates.length })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {certificates.length > 0 ? (
                                <div className="grid gap-4">
                                    {certificates.map((cert: any) => (
                                        <StudentCertificateCard key={cert.id} certificate={cert} />
                                    ))}
                                </div>
                            ) : (
                                <Card className="border-dashed">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                        <IconAward className="h-10 w-10 text-muted-foreground/20 mb-4" />
                                        <p className="max-w-[300px]">{t('certificates.noCertificates')}</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Achievements Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                        <IconTrophy size={20} />
                                    </div>
                                    <h2 className="text-lg font-bold">{t('achievementsTitle')}</h2>
                                </div>
                            </div>
                            <AchievementGrid />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
