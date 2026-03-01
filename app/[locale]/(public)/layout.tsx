import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";
import { PoweredByBanner } from "@/components/public/powered-by-banner";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import type { HeaderSettings, FooterSettings, LandingPageSettings } from "@/lib/landing-pages/types";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const tenant = await getCurrentTenant();
    const isSchoolSubdomain = tenant && tenant.id !== DEFAULT_TENANT_ID;

    let headerSettings: HeaderSettings | undefined;
    let footerSettings: FooterSettings | undefined;

    if (isSchoolSubdomain) {
        const supabase = await createClient();
        const { data: landingPage } = await supabase
            .from('landing_pages')
            .select('settings')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true)
            .eq('status', 'published')
            .limit(1)
            .maybeSingle();

        if (landingPage?.settings) {
            const settings = landingPage.settings as unknown as LandingPageSettings;
            headerSettings = settings.header;
            footerSettings = settings.footer;
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-black text-white selection:bg-blue-500/30">
            <Navbar headerSettings={headerSettings} />
            <main className="flex-1">
                {children}
            </main>
            <PoweredByBanner />
            <Footer footerSettings={footerSettings} />
        </div>
    );
}
