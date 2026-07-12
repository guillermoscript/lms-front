import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "../globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantProvider } from "@/components/tenant/tenant-provider"
import { TenantCssVars } from "@/components/tenant/tenant-css-vars";
import { TenantCssVarsServer } from "@/components/tenant/tenant-css-vars-server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import { getSeoContext, ogImageUrl } from '@/lib/seo';

const notoSans = Noto_Sans({ variable: '--font-sans', subsets: ["latin"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });
  const { baseUrl, siteName } = await getSeoContext();
  const description = t('defaultDescription');

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    openGraph: {
      siteName,
      type: 'website',
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      title: siteName,
      description,
      images: [
        {
          url: ogImageUrl({ title: siteName, subtitle: description, site: siteName }),
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description,
    },
  };
}

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

  // Load tenant settings for branding overrides (use admin client to bypass RLS
  // since these are public tenant configuration, not user-specific data)
  let tenantSettings: Record<string, any> = {};
  if (tenant) {
    const sb = createAdminClient();
    const { data: settings } = await sb
      .from('tenant_settings')
      .select('setting_key, setting_value')
      .eq('tenant_id', tenant.id)
      .in('setting_key', ['site_name', 'logo_url', 'primary_color', 'secondary_color', 'favicon_url', 'theme_preset']);
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
    theme_preset: tenantSettings.theme_preset ?? null,
  } : null;

  return (
    <html lang={locale} className={notoSans.variable} suppressHydrationWarning>
      <head>
        <TenantCssVarsServer
          themePreset={tenantInfo?.theme_preset}
          primaryColor={tenantInfo?.primary_color}
          secondaryColor={tenantInfo?.secondary_color}
        />
      </head>
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
