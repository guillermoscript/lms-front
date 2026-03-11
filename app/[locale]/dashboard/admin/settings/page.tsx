import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getAllSettingsByCategory } from '@/app/actions/admin/settings'
import { getOrCreateTenantReferralCode } from '@/app/actions/admin/referrals'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import GeneralSettingsForm from '@/components/admin/general-settings-form'
import EmailSettingsForm from '@/components/admin/email-settings-form'
import PaymentSettingsForm from '@/components/admin/payment-settings-form'
import EnrollmentSettingsForm from '@/components/admin/enrollment-settings-form'
import BrandingSettingsForm from '@/components/admin/branding-settings-form'
import { ReferralLinkCard } from '@/components/admin/referral-link-card'
import Link from 'next/link'
import { IconPalette } from '@tabler/icons-react'

export default async function SettingsPage() {
  const t = await getTranslations('dashboard.admin.settings')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const tAppearance = await getTranslations('dashboard.admin.appearance')
  // Verify admin role
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  // Fetch all settings grouped by category
  const result = await getAllSettingsByCategory()

  if (!result.success || !result.data) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('errorTitle')}</CardTitle>
            <CardDescription>
              {result.error || t('errorDesc')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const settings = result.data

  // Fetch referral code (non-blocking — silently skip if it fails)
  const referralCode = await getOrCreateTenantReferralCode().catch(() => null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'}`

  return (
    <div className="min-h-screen bg-background" data-testid="settings-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('settings') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Tabbed Settings Interface */}
          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="flex w-full overflow-x-auto lg:w-auto">
              <TabsTrigger value="general">{t('tabs.general')}</TabsTrigger>
              <TabsTrigger value="branding">{t('tabs.branding')}</TabsTrigger>
              <TabsTrigger value="appearance">{t('tabs.appearance')}</TabsTrigger>
              <TabsTrigger value="email">{t('tabs.email')}</TabsTrigger>
              <TabsTrigger value="payment">{t('tabs.payment')}</TabsTrigger>
              <TabsTrigger value="enrollment">{t('tabs.enrollment')}</TabsTrigger>
            </TabsList>

            {/* General Settings */}
            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>{t('sections.general.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.general.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GeneralSettingsForm settings={settings.general || {}} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Branding Settings */}
            <TabsContent value="branding">
              <Card>
                <CardHeader>
                  <CardTitle>{t('sections.branding.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.branding.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BrandingSettingsForm settings={settings.general || {}} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appearance — links to dedicated page */}
            <TabsContent value="appearance">
              <Card>
                <CardHeader>
                  <CardTitle>{tAppearance('title')}</CardTitle>
                  <CardDescription>
                    {tAppearance('description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="/dashboard/admin/appearance"
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <IconPalette className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{tAppearance('settingsLink.title')}</p>
                      <p className="text-xs text-muted-foreground">
                        {tAppearance('settingsLink.description')}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">&rarr;</span>
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Email Settings */}
            <TabsContent value="email">
              <Card>
                <CardHeader>
                  <CardTitle>{t('sections.email.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.email.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailSettingsForm settings={settings.email || {}} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Settings */}
            <TabsContent value="payment">
              <Card>
                <CardHeader>
                  <CardTitle>{t('sections.payment.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.payment.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentSettingsForm settings={settings.payment || {}} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Enrollment Settings */}
            <TabsContent value="enrollment">
              <Card>
                <CardHeader>
                  <CardTitle>{t('sections.enrollment.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.enrollment.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EnrollmentSettingsForm settings={settings.enrollment || {}} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Referral Program — secondary, below main settings */}
          {referralCode && (
            <ReferralLinkCard
              code={referralCode.code}
              usedCount={referralCode.used_count ?? 0}
              discountMonths={referralCode.discount_months ?? 1}
              referrerRewardMonths={referralCode.referrer_reward_months ?? 1}
              appUrl={appUrl}
            />
          )}
        </div>
      </main>
    </div>
  )
}
