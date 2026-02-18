import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "../globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantProvider } from "@/components/tenant/tenant-provider"
import { TenantCssVars } from "@/components/tenant/tenant-css-vars";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';

const notoSans = Noto_Sans({ variable: '--font-sans', subsets: ["latin"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LMS V2",
  description: "The ultimate learning platform powered by Next.js 16 and Supabase.",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();
  const tenant = await getCurrentTenant();

  // Load tenant settings for branding overrides
  let tenantSettings: Record<string, any> = {};
  if (tenant) {
    const { createClient: createSC } = await import('@/lib/supabase/server');
    const sb = await createSC();
    const { data: settings } = await sb
      .from('tenant_settings')
      .select('setting_key, setting_value')
      .eq('tenant_id', tenant.id)
      .in('setting_key', ['site_name', 'logo_url', 'primary_color', 'secondary_color', 'favicon_url']);
    if (settings) {
      tenantSettings = settings.reduce((acc: Record<string, any>, s) => {
        acc[s.setting_key] = s.setting_value;
        return acc;
      }, {});
    }
  }

  const tenantInfo = tenant ? {
    id: tenant.id,
    slug: tenant.slug,
    name: tenantSettings.site_name?.value || tenant.name,
    logo_url: tenantSettings.logo_url?.value || tenant.logo_url,
    primary_color: tenantSettings.primary_color?.value || tenant.primary_color,
    secondary_color: tenantSettings.secondary_color?.value || tenant.secondary_color,
    plan: tenant.plan,
    settings: tenantSettings,
  } : null;

  return (
    <html lang={locale} className={notoSans.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TenantProvider tenant={tenantInfo}>
              <TenantCssVars />
              {children}
              <Toaster />
            </TenantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
