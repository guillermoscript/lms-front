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
    IconTrophy,
    IconChartBar,
    IconAward,
    IconBook2,
    IconArrowRight,
    IconPlayerPlay,
    IconCircleCheck,
} from "@tabler/icons-react"
import { ProfileForm } from '@/components/student/profile-form'
import { cn } from "@/lib/utils"
import { XPProgressCircle } from '@/components/gamification/xp-progress-circle'
import { AchievementGrid } from '@/components/gamification/achievement-grid'
import { StreakCalendar } from '@/components/gamification/streak-calendar'
import { ProfileGamificationStats } from '@/components/gamification/profile-stats'
import Link from 'next/link'
import Image from 'next/image'
import { StudentCertificateCard } from '@/components/student/student-certificate-card'
import { getCurrentTenantId, getSessionUser } from '@/lib/supabase/tenant'
import { createClient } from '@/lib/supabase/server'

async function getProfileData(userId: string, tenantId: string) {
    const supabase = await createClient()

    const [profileRes, subscriptionRes, transactionsRes, certificatesRes, enrollmentsRes] = await Promise.all([
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
            .order('issued_at', { ascending: false }),
        supabase
            .from('enrollments')
            .select('enrollment_id, enrollment_date, course_id, status')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .order('enrollment_date', { ascending: false })
            .limit(6),
    ])

    // Enrich enrolled courses with basic data + progress
    const enrollmentRows = enrollmentsRes.data || []
    const courseIds = enrollmentRows.map(e => e.course_id)

    let enrolledCourses: any[] = []

    if (courseIds.length > 0) {
        const [coursesRes, lessonsRes] = await Promise.all([
            supabase
                .from('courses')
                .select('course_id, title, thumbnail_url')
                .in('course_id', courseIds)
                .eq('tenant_id', tenantId),
            supabase
                .from('lessons')
                .select('id, course_id')
                .in('course_id', courseIds)
                .eq('tenant_id', tenantId),
        ])

        const allLessonIds = (lessonsRes.data || []).map(l => l.id)

        const { data: completionsData } = allLessonIds.length > 0
            ? await supabase
                .from('lesson_completions')
                .select('lesson_id')
                .eq('user_id', userId)
                .eq('tenant_id', tenantId)
                .in('lesson_id', allLessonIds)
            : { data: [] }

        const completedSet = new Set((completionsData || []).map(c => c.lesson_id))
        const courseMap = new Map((coursesRes.data || []).map(c => [c.course_id, c]))
        const lessonsByCourse = (lessonsRes.data || []).reduce<Record<number, number[]>>((acc, l) => {
            if (!acc[l.course_id]) acc[l.course_id] = []
            acc[l.course_id].push(l.id)
            return acc
        }, {})

        enrolledCourses = enrollmentRows
            .map(enrollment => {
                const course = courseMap.get(enrollment.course_id)
                if (!course) return null
                const lessonIds = lessonsByCourse[enrollment.course_id] || []
                const completed = lessonIds.filter(id => completedSet.has(id)).length
                const total = lessonIds.length
                const progress = total > 0 ? Math.round((completed / total) * 100) : 0
                return { ...enrollment, course, completedLessons: completed, totalLessons: total, progress }
            })
            .filter(Boolean)
    }

    return {
        profile: profileRes.data,
        subscription: subscriptionRes.data,
        transactions: transactionsRes.data || [],
        certificates: certificatesRes.data || [],
        enrolledCourses,
    }
}

// ─── Section Header helper ────────────────────────────────────────────────────
function SectionHeader({
    icon,
    title,
    subtitle,
    badge,
    action,
    iconColor = 'text-primary',
    iconBg = 'bg-primary/10',
}: {
    icon: React.ReactNode
    title: string
    subtitle?: string
    badge?: React.ReactNode
    action?: React.ReactNode
    iconColor?: string
    iconBg?: string
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn('p-2 rounded-xl shrink-0', iconBg, iconColor)}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight truncate">{title}</h2>
                    {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {badge}
                {action}
            </div>
        </div>
    )
}

// ─── Purchased Course Card ────────────────────────────────────────────────────
function PurchasedCourseCard({ course: ec, labels }: { course: any; labels: { noLessons: string; lessons: string; completed: string; notStarted: string } }) {
    const isCompleted = ec.progress === 100
    const hasStarted = ec.completedLessons > 0

    return (
        <Link
            href={`/dashboard/student/courses/${ec.course.course_id}`}
            className="group block"
        >
            <div className="flex gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/40 hover:border-primary/30 transition-all duration-200">
                {/* Thumbnail */}
                <div className="relative h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-lg overflow-hidden bg-muted">
                    {ec.course.thumbnail_url ? (
                        <Image
                            src={ec.course.thumbnail_url}
                            alt={ec.course.title}
                            fill
                            className="object-cover"
                            sizes="80px"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-primary/5">
                            <IconBook2 className="h-6 w-6 text-primary/40" />
                        </div>
                    )}
                    {isCompleted && (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/80">
                            <IconCircleCheck className="h-7 w-7 text-white" />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                            {ec.course.title}
                        </p>
                        <IconArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-0.5" />
                    </div>

                    <div className="space-y-1.5">
                        {/* Progress bar */}
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all",
                                    isCompleted ? "bg-emerald-500" : "bg-primary"
                                )}
                                style={{ width: `${ec.progress}%` }}
                            />
                        </div>
                        {/* Progress label */}
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">
                                {ec.totalLessons === 0
                                    ? labels.noLessons
                                    : `${ec.completedLessons} / ${ec.totalLessons} ${labels.lessons}`}
                            </span>
                            <span className={cn(
                                "text-[11px] font-bold tabular-nums",
                                isCompleted ? "text-emerald-600 dark:text-emerald-400"
                                    : hasStarted ? "text-primary"
                                        : "text-muted-foreground"
                            )}>
                                {isCompleted ? labels.completed : hasStarted ? `${ec.progress}%` : labels.notStarted}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ProfilePage() {
    const tenantId = await getCurrentTenantId()
    const supabase = await createClient()
    const user = await getSessionUser()
    if (!user) {
        redirect('/auth/login')
    }

    const { profile, subscription, transactions, certificates, enrolledCourses } = await getProfileData(user.id, tenantId)
    const userInitial = profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"

    const t = await getTranslations('dashboard.student.profile')
    const tCommon = await getTranslations('common')
    const tProgress = await getTranslations('dashboard.student.progress')

    const transactionStatusLabel = (status: string) => {
        const map: Record<string, string> = {
            successful: t('txStatus.successful'),
            pending: t('txStatus.pending'),
            failed: t('txStatus.failed'),
            canceled: t('txStatus.canceled'),
            refunded: t('txStatus.refunded'),
        }
        return map[status] || status
    }

    const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
    const currencyFormatter = (amount: number, currency: string) =>
        new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)

    return (
        <div className="min-h-screen bg-background pb-20" data-testid="profile-page">
            <main className="container mx-auto px-4 md:px-8 py-8 md:py-12">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">{t('editProfile')}</h1>
                    <p className="text-muted-foreground mt-1">{t('editProfileSubtitle')}</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* ── Sidebar ─────────────────────────────────────── */}
                    <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-6">

                        {/* Profile Card */}
                        <Card className="border border-border overflow-hidden">
                            <div className="h-20 bg-primary" />
                            <CardContent className="px-6 pb-6 pt-0 -mt-12 text-center relative">
                                <Avatar className="h-24 w-24 mx-auto border-4 border-background shadow-xl">
                                    <AvatarImage src={profile?.avatar_url} alt={profile?.full_name || 'Profile'} />
                                    <AvatarFallback className="text-2xl font-black bg-primary/10 text-primary">
                                        {userInitial}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="mt-3 space-y-1">
                                    <h2 className="text-xl font-bold tracking-tight truncate">{profile?.full_name || user.email?.split('@')[0]}</h2>
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
                        <Card className="border border-border bg-card overflow-hidden">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <IconCrown size={18} className="text-primary" />
                                    {t('currentPlan')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {subscription ? (
                                    <>
                                        <div>
                                            <h3 className="text-xl font-bold">{subscription.plans?.plan_name}</h3>
                                            <p className="text-muted-foreground text-xs font-medium">
                                                {t('renewsOn', { date: dateFormatter.format(new Date(subscription.end_date)) })}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            {(subscription.plans?.features ?? '').split(',').filter(Boolean).slice(0, 3).map((f: string, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <IconCheck size={14} className="text-emerald-500 shrink-0" />
                                                    <span className="line-clamp-1">{f.trim()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <Button variant="outline" className="w-full rounded-xl h-10 font-semibold">
                                            {t('manageSubscription')}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-muted-foreground">{t('noActiveSubscription')}</p>
                                        <Link href="/pricing">
                                            <Button variant="outline" className="w-full rounded-xl h-10 font-semibold">
                                                {t('viewPlans')}
                                            </Button>
                                        </Link>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Main Content ─────────────────────────────────── */}
                    <div className="flex-1 min-w-0 space-y-8">

                        {/* Account Settings */}
                        <Card className="border border-border">
                            <CardHeader className="border-b border-border">
                                <SectionHeader
                                    icon={<IconSettings size={20} />}
                                    title={t('accountDetails')}
                                    subtitle={t('accountDetailsSubtitle')}
                                />
                            </CardHeader>
                            <CardContent className="p-6">
                                <ProfileForm profile={profile} />
                            </CardContent>
                        </Card>

                        {/* ── Purchased Courses ──────────────────────── */}
                        <Card className="border border-border overflow-hidden">
                            <CardHeader className="border-b border-border">
                                <SectionHeader
                                    icon={<IconBook2 size={20} />}
                                    title={t('myCourses')}
                                    subtitle={enrolledCourses.length > 0
                                        ? t('coursesEnrolled', { count: enrolledCourses.length })
                                        : undefined}
                                    badge={enrolledCourses.length > 0 ? (
                                        <Badge variant="outline" className="font-bold text-xs">
                                            {enrolledCourses.length}
                                        </Badge>
                                    ) : undefined}
                                    action={enrolledCourses.length > 0 ? (
                                        <Link href="/dashboard/student/courses">
                                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-semibold">
                                                {tCommon('viewAll')}
                                                <IconArrowRight size={13} />
                                            </Button>
                                        </Link>
                                    ) : undefined}
                                />
                            </CardHeader>
                            <CardContent className="p-6">
                                {enrolledCourses.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {enrolledCourses.map((ec: any) => (
                                            <PurchasedCourseCard
                                                key={ec.enrollment_id}
                                                course={ec}
                                                labels={{
                                                    noLessons: t('noLessonsYet'),
                                                    lessons: tCommon('lessons'),
                                                    completed: tProgress('completed'),
                                                    notStarted: tProgress('notStarted'),
                                                }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                                            <IconBook2 className="h-7 w-7 text-primary/30" />
                                        </div>
                                        <p className="font-semibold text-foreground">{t('noCoursesYet')}</p>
                                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                            {t('noCoursesYetDesc')}
                                        </p>
                                        <Link href="/dashboard/student/browse" className="mt-4">
                                            <Button size="sm" variant="outline" className="gap-2 font-semibold">
                                                <IconPlayerPlay size={15} />
                                                {tCommon('browseCourses')}
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Billing History */}
                        <Card className="border border-border overflow-hidden">
                            <CardHeader className="border-b border-border">
                                <SectionHeader
                                    icon={<IconHistory size={20} />}
                                    title={t('billingHistory')}
                                    badge={
                                        <Badge variant="outline" className="font-bold text-xs">
                                            {t('records', { count: transactions.length })}
                                        </Badge>
                                    }
                                />
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
                                                                {transactionStatusLabel(tx.status)}
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
                            <SectionHeader
                                icon={<IconAward size={20} />}
                                title={t('certificates.title')}
                                subtitle={certificates.length > 0 ? t('certificates.subtitle', { count: certificates.length }) : undefined}
                            />

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
                            <SectionHeader
                                icon={<IconTrophy size={20} />}
                                title={t('achievementsTitle')}
                                iconColor="text-amber-600 dark:text-amber-400"
                                iconBg="bg-amber-500/10"
                            />
                            <AchievementGrid />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
