import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { getUserRole } from "@/lib/supabase/get-user-role"
import { createClient } from "@/lib/supabase/server"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/user-nav"
import { LanguageSwitcher } from "@/components/language-switcher"
import { GamificationHeaderCard } from "@/components/gamification/gamification-header-card"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const role = await getUserRole()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    return (
        <SidebarProvider>
            <AppSidebar userRole={role} />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <div className="ml-auto flex items-center gap-4">
                        {role === 'student' && (
                            <div className="hidden md:block">
                                <GamificationHeaderCard />
                            </div>
                        )}
                        <LanguageSwitcher />
                        <ModeToggle />
                        <UserNav user={user} />
                    </div>
                </header>
                <div className="flex flex-1 flex-col">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
