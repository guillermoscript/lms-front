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

export default async function SettingsPage() {
  const t = await getTranslations('dashboard.admin.settings')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
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
    <div className="space-y-6 p-6 lg:p-8" data-testid="settings-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('settings') },
        ]}
      />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('description')}
        </p>
      </div>

      {/* Referral Program */}
      {referralCode && (
        <ReferralLinkCard
          code={referralCode.code}
          usedCount={referralCode.used_count ?? 0}
          discountMonths={referralCode.discount_months ?? 1}
          referrerRewardMonths={referralCode.referrer_reward_months ?? 1}
          appUrl={appUrl}
        />
      )}

      {/* Tabbed Settings Interface */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto">
          <TabsTrigger value="general">{t('tabs.general')}</TabsTrigger>
          <TabsTrigger value="branding">{t('tabs.branding')}</TabsTrigger>
          <TabsTrigger value="email">{t('tabs.email')}</TabsTrigger>
          <TabsTrigger value="payment">{t('tabs.payment')}</TabsTrigger>
          <TabsTrigger value="enrollment">{t('tabs.enrollment')}</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
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
        <TabsContent value="branding" className="space-y-4">
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

        {/* Email Settings */}
        <TabsContent value="email" className="space-y-4">
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
        <TabsContent value="payment" className="space-y-4">
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
        <TabsContent value="enrollment" className="space-y-4">
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
    </div>
  )
}
