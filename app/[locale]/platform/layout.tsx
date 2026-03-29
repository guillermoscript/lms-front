import { Suspense } from 'react'
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { PlatformSidebar } from "@/components/platform-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/user-nav"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/supabase/get-user-role"
import { redirect } from "next/navigation"

async function PlatformSidebarWithCount() {
  const adminClient = createAdminClient()
  const { count: pendingCount } = await adminClient
    .from('platform_payment_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return <PlatformSidebar pendingBillingCount={pendingCount ?? 0} />
}

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await isSuperAdmin())) {
    redirect(`/${locale}/auth/login`)
  }

  return (
    <SidebarProvider>
      <Suspense fallback={<PlatformSidebar pendingBillingCount={0} />}>
        <PlatformSidebarWithCount />
      </Suspense>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Platform Admin</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
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
