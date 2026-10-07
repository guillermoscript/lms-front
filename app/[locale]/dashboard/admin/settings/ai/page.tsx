import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react'

import { getAiSettingsDTO } from '@/app/actions/admin/ai-settings'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { AdvancedFeatures } from '@/components/admin/ai/advanced-features'
import { AuditHistory } from '@/components/admin/ai/audit-history'
import { BillingModeCard } from '@/components/admin/ai/billing-mode-card'
import { DefaultModelCard } from '@/components/admin/ai/default-model-card'
import { ProviderCard } from '@/components/admin/ai/provider-card'
import { TraceContentCard } from '@/components/admin/ai/trace-content-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getUserRole } from '@/lib/supabase/get-user-role'

export default async function AiSettingsPage() {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/dashboard/admin')

  const [t, tBreadcrumbs, result] = await Promise.all([
    getTranslations('aiSettings'),
    getTranslations('dashboard.admin.breadcrumbs'),
    getAiSettingsDTO(),
  ])

  const header = (
    <header className="border-b bg-card">
      <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4">
          <AdminBreadcrumb
            items={[
              { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
              { label: tBreadcrumbs('settings'), href: '/dashboard/admin/settings' },
              { label: t('breadcrumb') },
            ]}
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
      </div>
    </header>
  )

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-background" data-testid="ai-settings-page">
        {header}
        <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
          <Alert variant="destructive" data-testid="ai-settings-error">
            <IconAlertTriangle aria-hidden />
            <AlertTitle>{t('loadError.title')}</AlertTitle>
            <AlertDescription>
              {result.error === 'server_misconfigured' ? t('errors.server_misconfigured') : t('loadError.description')}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    )
  }

  const { settings } = result

  return (
    <div className="min-h-screen bg-background" data-testid="ai-settings-page">
      {header}
      <main className="mx-auto container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {!settings.configured && (
          <Alert data-testid="ai-setup-hint">
            <IconSparkles aria-hidden />
            <AlertTitle>{t('setup.title')}</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>{t('setup.step1')}</li>
                <li>{t('setup.step2')}</li>
              </ol>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('providers.title')}</CardTitle>
            <CardDescription>{t('providers.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {settings.providers.map((provider) => (
                <ProviderCard key={provider.provider} provider={provider} />
              ))}
            </div>
          </CardContent>
        </Card>

        <DefaultModelCard
          key={`${settings.defaultModel?.provider ?? ''}:${settings.defaultModel?.model ?? ''}`}
          providers={settings.providers}
          current={settings.defaultModel}
        />

        <AdvancedFeatures features={settings.features} providers={settings.providers} />

        <BillingModeCard mode={settings.mode} />

        <TraceContentCard enabled={settings.traceContent} />

        <AuditHistory rows={settings.recentAudit} />
      </main>
    </div>
  )
}
