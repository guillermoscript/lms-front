import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { getUserRole } from "@/lib/supabase/get-user-role"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const role = await getUserRole()

    return (
        <SidebarProvider>
            <AppSidebar userRole={role} />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    {/* We can add Breadcrumbs here later if needed */}
                </header>
                <div className="flex flex-1 flex-col">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
