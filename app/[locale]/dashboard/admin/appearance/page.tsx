import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getActivePreset } from '@/app/actions/admin/theme'
import { getAllSettingsByCategory } from '@/app/actions/admin/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemePresetSelector } from '@/components/admin/theme-preset-selector'
import { ThemePreview } from '@/components/admin/theme-preview'
import BrandingSettingsForm from '@/components/admin/branding-settings-form'

export default async function AppearancePage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const t = await getTranslations('dashboard.admin.appearance')
  const tSettings = await getTranslations('dashboard.admin.settings')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  const activePreset = await getActivePreset()
  const settingsResult = await getAllSettingsByCategory()
  const settings = settingsResult.success ? settingsResult.data : null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('settings'), href: '/dashboard/admin/settings' },
                { label: tBreadcrumbs('appearance') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Left: Preview */}
          <div className="order-2 lg:order-1">
            <ThemePreview />
          </div>

          {/* Right: Theme controls + Branding */}
          <div className="order-1 lg:order-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('theme.title')}</CardTitle>
                <CardDescription>
                  {t('theme.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ThemePresetSelector activePreset={activePreset} />
              </CardContent>
            </Card>

            {settings && (
              <Card>
                <CardHeader>
                  <CardTitle>{tSettings('sections.branding.title')}</CardTitle>
                  <CardDescription>
                    {tSettings('sections.branding.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BrandingSettingsForm settings={settings.general || {}} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
