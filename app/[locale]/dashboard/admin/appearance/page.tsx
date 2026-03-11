import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getActivePreset } from '@/app/actions/admin/theme'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemePresetSelector } from '@/components/admin/theme-preset-selector'
import { ThemePreview } from '@/components/admin/theme-preview'

export default async function AppearancePage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const t = await getTranslations('dashboard.admin.appearance')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  const activePreset = await getActivePreset()

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

          {/* Right: Theme controls */}
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
          </div>
        </div>
      </main>
    </div>
  )
}
