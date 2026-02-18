import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from 'next-intl/server';
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { NavbarTenantSwitcher } from "@/components/tenant/navbar-tenant-switcher";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function Navbar() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const t = await getTranslations('navbar');
    const tenant = await getCurrentTenant();

    const isMainPlatform = !tenant || tenant.id === DEFAULT_TENANT_ID

    // Load branding overrides from tenant_settings
    let brandingOverrides: Record<string, any> = {};
    if (tenant) {
        const { data: tsData } = await supabase
            .from('tenant_settings')
            .select('setting_key, setting_value')
            .eq('tenant_id', tenant.id)
            .in('setting_key', ['site_name', 'logo_url', 'primary_color']);
        if (tsData) {
            brandingOverrides = tsData.reduce((acc: Record<string, any>, s) => {
                acc[s.setting_key] = s.setting_value?.value;
                return acc;
            }, {});
        }
    }

    // Get user's tenants for the switcher
    let userTenants: any[] = [];
    if (user) {
        const { data } = await supabase
            .from('tenant_users')
            .select('role, tenant:tenants(id, slug, name)')
            .eq('user_id', user.id)
            .eq('status', 'active');
        userTenants = (data || []).map((tu: any) => ({
            ...tu.tenant,
            role: tu.role,
        }));
    }

    const brandName = brandingOverrides.site_name || tenant?.name || t('brand');
    const logoUrl = brandingOverrides.logo_url || tenant?.logo_url;
    const logoColor = brandingOverrides.primary_color || tenant?.primary_color || '#3B82F6';

    return (
        <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">

                {/* Logo + Tenant Branding */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="flex items-center space-x-2">
                        {logoUrl ? (
                            <img src={logoUrl} alt={brandName} className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: logoColor }}
                            >
                                <span className="font-bold text-white">{brandName[0]?.toUpperCase()}</span>
                            </div>
                        )}
                        <span className="font-bold text-lg text-white tracking-tight">
                            {brandName}
                        </span>
                    </Link>

                    {userTenants.length > 1 && (
                        <NavbarTenantSwitcher tenants={userTenants} />
                    )}
                </div>

                {/* Center Links */}
                <div className="hidden md:flex items-center space-x-8">
                    {isMainPlatform ? (
                        <>
                            <Link href="/#features" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                                {t('features')}
                            </Link>
                            <Link href="/platform-pricing" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                                {t('pricing')}
                            </Link>
                            <Link href="/creators" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                                {t('creators')}
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/courses" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                                {t('courses')}
                            </Link>
                            <Link href="/about" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                                {t('about')}
                            </Link>
                        </>
                    )}
                </div>

                {/* Right Actions */}
                <div className="flex items-center space-x-4">
                    <LanguageSwitcher />

                    {user ? (
                        <Link href="/dashboard/student">
                            <Button variant="default" className="bg-white text-black hover:bg-zinc-200">
                                {t('dashboard')}
                            </Button>
                        </Link>
                    ) : (
                        <>
                            <Link href="/auth/login" className="hidden sm:inline-block">
                                <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-white/5">
                                    {t('login')}
                                </Button>
                            </Link>
                            {isMainPlatform ? (
                                <Link href="/create-school">
                                    <Button className="bg-blue-600 hover:bg-blue-500 text-white border-0 font-medium">
                                        {t('startFree')} →
                                    </Button>
                                </Link>
                            ) : (
                                <Link href="/auth/sign-up?next=/join-school">
                                    <Button className="bg-blue-600 hover:bg-blue-500 text-white border-0 font-medium">
                                        {t('join')} {tenant?.name}
                                    </Button>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
