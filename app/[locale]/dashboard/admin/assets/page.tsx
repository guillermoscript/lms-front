import { getTranslations } from 'next-intl/server'

import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { AssetLibrary } from '@/components/assets/asset-library'

export default async function AssetsPage() {
  const t = await getTranslations('assets')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  return (
    <div className="min-h-screen bg-background" data-testid="assets-page">
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('website'), href: '/dashboard/admin/landing-page' },
                { label: tBreadcrumbs('assets') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>
      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        <AssetLibrary mode="manage" />
      </main>
    </div>
  )
}
