import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";
import { PoweredByBanner } from "@/components/public/powered-by-banner";
import { getCurrentTenantId, getCurrentTenant } from "@/lib/supabase/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

async function hasPuckPage(): Promise<boolean> {
    try {
        const tenantId = await getCurrentTenantId()
        if (tenantId === DEFAULT_TENANT_ID) return false
        const tenant = await getCurrentTenant()
        if (!tenant || !PAID_PLANS.includes(tenant.plan)) return false
        const adminClient = createAdminClient()
        const { data } = await adminClient
            .from('landing_pages')
            .select('page_id')
            .eq('tenant_id', tenantId)
            .eq('is_published', true)
            .limit(1)
            .maybeSingle()
        return !!data
    } catch {
        return false
    }
}

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isPuckPage = await hasPuckPage()

    // When a Puck page is active, it has its own header/footer — skip the shell
    if (isPuckPage) {
        return (
            <div className="flex min-h-screen flex-col">
                <main className="flex-1">
                    {children}
                </main>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/30">
            <Navbar />
            <main className="flex-1">
                {children}
            </main>
            <PoweredByBanner />
            <Footer />
        </div>
    );
}
