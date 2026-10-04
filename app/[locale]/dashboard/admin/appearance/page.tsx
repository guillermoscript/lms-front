import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getAllSettingsByCategory } from '@/app/actions/admin/settings'
import { getSchoolTheme } from '@/app/actions/admin/theme'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import BrandingSettingsForm from '@/components/admin/branding-settings-form'
import { ThemeKitPicker } from '@/components/theme-kit/theme-kit-picker'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { hasPlanFeature } from '@/lib/plans/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function AppearancePage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const tenantId = await getCurrentTenantId()
  const [t, tSettings, tBreadcrumbs, stored, settingsResult, customBranding] = await Promise.all([
    getTranslations('dashboard.admin.appearance'),
    getTranslations('dashboard.admin.settings'),
    getTranslations('dashboard.admin.breadcrumbs'),
    getSchoolTheme(),
    getAllSettingsByCategory(),
    // Themes and their recommended colours are open on every plan (#763); only
    // a custom hex is `custom_branding` (Business+), so this decides whether
    // the picker offers the hex field or the upgrade nudge.
    hasPlanFeature(tenantId, 'custom_branding'),
  ])
  const settings = settingsResult.success ? settingsResult.data : null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('website'), href: '/dashboard/admin/landing-page' },
                { label: tBreadcrumbs('appearance') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container flex flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <ThemeKitPicker stored={stored} customBranding={customBranding} variant="admin" />

        {settings && (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>{tSettings('sections.branding.title')}</CardTitle>
              <CardDescription>{tSettings('sections.branding.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <BrandingSettingsForm settings={settings.general || {}} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
