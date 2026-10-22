import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";
import { PoweredByBanner } from "@/components/public/powered-by-banner";
import { getCurrentTenantId, getCurrentTenant } from "@/lib/supabase/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGlobalParts } from "@/lib/puck/utils/global-parts-server";
import { GlobalPartView } from "@/components/public/landing-page/global-part";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

async function getPuckShell() {
    try {
        const tenantId = await getCurrentTenantId()
        if (tenantId === DEFAULT_TENANT_ID) return null
        const tenant = await getCurrentTenant()
        if (!tenant) return null
        const adminClient = createAdminClient()
        const { data } = await adminClient
            .from('landing_pages')
            .select('page_id')
            .eq('tenant_id', tenantId)
            .eq('kind', 'page')
            .eq('is_published', true)
            .limit(1)
            .maybeSingle()
        if (!data) return null
        return await getGlobalParts(tenantId)
    } catch {
        return null
    }
}

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const parts = await getPuckShell()

    // A school with a published Puck site brings its own chrome: its global header/footer
    // (the home page's) wrap every public route; the platform shell is skipped.
    if (parts) {
        return (
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                {parts.header && <GlobalPartView part={parts.header} />}
                <main className="flex-1">
                    {children}
                </main>
                {parts.footer && <GlobalPartView part={parts.footer} />}
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
