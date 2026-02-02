import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    IconUser,
    IconMail,
    IconCalendar,
    IconCreditCard,
    IconHistory,
    IconSettings,
    IconCheck,
    IconCrown,
    IconEdit
} from "@tabler/icons-react"
import { DashboardHeader } from '@/components/student/dashboard-header'
import { ProfileForm } from '@/components/student/profile-form'
import { cn } from "@/lib/utils"

async function getProfileData(userId: string) {
    const supabase = await createClient()

    // Fetch basic profile data
    const { data: profile } = await supabase
        .from('profiles')
        .select('*, user_roles(role)')
        .eq('id', userId)
        .single()

    // Fetch active subscription
    const { data: subscription } = await supabase
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
        .eq('subscription_status', 'active')
        .maybeSingle()

    // Fetch transaction history
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(10)

    return {
        profile,
        subscription,
        transactions: transactions || []
    }
}

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    const { profile, subscription, transactions } = await getProfileData(user.id)
    const userInitial = user.email?.[0].toUpperCase() || "U"

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 pb-20">
            <DashboardHeader user={user} />

            <main className="container mx-auto px-4 md:px-8 py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col lg:row gap-8">
                    {/* Sidebar / Profile Card */}
                    <div className="w-full lg:w-1/3 space-y-6">
                        <Card className="border-none shadow-soft overflow-hidden">
                            <div className="h-32 bg-gradient-to-r from-indigo-600 to-violet-600" />
                            <CardContent className="px-6 pb-8 pt-0 -mt-16 text-center">
                                <Avatar className="h-32 w-32 mx-auto border-4 border-background shadow-xl">
                                    <AvatarImage src={profile?.avatar_url} />
                                    <AvatarFallback className="text-4xl font-black bg-primary/10 text-primary">
                                        {userInitial}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="mt-4 space-y-1">
                                    <h2 className="text-2xl font-black tracking-tight">{profile?.full_name || 'Student'}</h2>
                                    <p className="text-muted-foreground font-medium">{user.email}</p>
                                    <div className="flex justify-center gap-2 mt-2">
                                        {profile?.user_roles?.map((ur: any) => (
                                            <Badge key={ur.role} variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase tracking-widest text-[10px] font-black">
                                                {ur.role}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-8 pt-8 border-t border-muted/30 grid grid-cols-2 gap-4">
                                    <div className="text-center">
                                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Signed Up</p>
                                        <p className="font-bold text-sm">{new Date(user.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5 font-bold">
                                            Active
                                        </Badge>
                                    </div>
                                </div>
                                <Button className="w-full mt-8 rounded-2xl h-12 font-black gap-2">
                                    <IconEdit size={18} />
                                    Edit Profile
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Subscription Quick Info */}
                        <Card className="border-none shadow-soft bg-gradient-to-br from-indigo-900 to-slate-900 text-white overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <IconCrown size={80} />
                            </div>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <IconCrown size={20} className="text-amber-400" />
                                    Current Plan
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {subscription ? (
                                    <>
                                        <div>
                                            <h3 className="text-2xl font-black">{subscription.plans?.plan_name}</h3>
                                            <p className="text-indigo-200 text-xs font-medium">Renews on {new Date(subscription.end_date).toLocaleDateString()}</p>
                                        </div>
                                        <div className="space-y-2">
                                            {subscription.plans?.features?.split(',').slice(0, 3).map((f: string, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-sm text-indigo-100">
                                                    <IconCheck size={16} className="text-emerald-400 shrink-0" />
                                                    <span className="line-clamp-1">{f.trim()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <Button variant="outline" className="w-full bg-white/10 border-white/20 hover:bg-white/20 text-white rounded-xl h-10 font-bold">
                                            Manage Subscription
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-indigo-100/70">You don't have an active subscription yet.</p>
                                        <Button className="w-full bg-white text-indigo-900 hover:bg-indigo-50 rounded-xl h-11 font-black">
                                            View Plans
                                        </Button>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Content Areas */}
                    <div className="flex-1 space-y-8">
                        {/* Transaction History */}
                        <Card className="border-none shadow-soft overflow-hidden">
                            <CardHeader className="border-b border-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                            <IconHistory size={20} />
                                        </div>
                                        <CardTitle className="text-xl font-black">Billing History</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="font-bold">
                                        {transactions.length} Records
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {transactions.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-muted/30">
                                                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-muted/30">ID</th>
                                                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-muted/30">Date</th>
                                                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-muted/30">Amount</th>
                                                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-muted/30">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-muted/30">
                                                {transactions.map((tx: any) => (
                                                    <tr key={tx.transaction_id} className="hover:bg-muted/10 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-bold text-muted-foreground">#{tx.transaction_id}</td>
                                                        <td className="px-6 py-4 text-sm font-medium">{new Date(tx.transaction_date).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-foreground">
                                                            {tx.amount.toLocaleString('en-US', { style: 'currency', currency: tx.currency || 'USD' })}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Badge className={cn(
                                                                "font-bold uppercase tracking-tighter text-[10px]",
                                                                tx.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
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
                                    <div className="p-12 text-center text-muted-foreground italic">
                                        No transactions found.
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Profile Settings Form */}
                        <Card className="border-none shadow-soft">
                            <CardHeader className="border-b border-muted/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <IconSettings size={20} />
                                    </div>
                                    <CardTitle className="text-xl font-black">Account Details</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <ProfileForm profile={profile} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}

