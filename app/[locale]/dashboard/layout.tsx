import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { getUserRole } from "@/lib/supabase/get-user-role"
import { getSessionUser } from "@/lib/supabase/tenant"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/user-nav"
import { LanguageSwitcher } from "@/components/language-switcher"
import { GamificationHeaderCard } from "@/components/gamification/gamification-header-card"
import { VerifyEmailBanner } from "@/components/shared/verify-email-banner"
import { AccessCutoffBanner } from "@/components/shared/access-cutoff-banner"
import type { Metadata } from "next"

export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const role = await getUserRole()
    const user = await getSessionUser()

    return (
        <SidebarProvider>
            <AppSidebar userRole={role} />
            <SidebarInset>
                <header className="flex h-16 min-w-0 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <div className="ml-auto flex min-w-0 items-center gap-4">
                        {/* #586: gated at `lg`, not `md`. The desktop sidebar
                            arrives at `md` and takes 256px, which leaves the
                            inset too narrow for these chips — the page ended up
                            scrolling sideways between 768px and ~890px. Below
                            `lg` the same card is reachable in the avatar
                            dropdown (see components/user-nav.tsx), so the two
                            breakpoints must stay in lockstep. */}
                        {role === 'student' && (
                            <div className="hidden lg:block">
                                <GamificationHeaderCard />
                            </div>
                        )}
                        <LanguageSwitcher />
                        <ModeToggle />
                        <UserNav user={user} />
                    </div>
                </header>
                {user?.email && !user.email_confirmed_at && (
                    <VerifyEmailBanner email={user.email} />
                )}
                {/* #517: admins are the only ones who can act on a plan-limit
                    cutoff, and before this they only saw it if they happened to
                    open the billing page. */}
                {role === 'admin' && <AccessCutoffBanner />}
                <div className="flex flex-1 flex-col">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
