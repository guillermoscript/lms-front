import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getAllSettingsByCategory, getSolanaWallet } from '@/app/actions/admin/settings'
import { getOrCreateTenantReferralCode } from '@/app/actions/admin/referrals'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import GeneralSettingsForm from '@/components/admin/general-settings-form'
import EmailSettingsForm from '@/components/admin/email-settings-form'
import PaymentSettingsForm from '@/components/admin/payment-settings-form'
import StripeConnectCard from '@/components/admin/stripe-connect-card'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { syncConnectAccountStatus } from '@/lib/stripe-connect'
import SolanaWalletForm from '@/components/admin/solana-wallet-form'
import EnrollmentSettingsForm from '@/components/admin/enrollment-settings-form'
import { ReferralLinkCard } from '@/components/admin/referral-link-card'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
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

  // Fetch the tenant's Solana receiving wallet (non-blocking — empty if unset)
  const solanaWallet = await getSolanaWallet().catch(() => null)
  const solanaWalletAddress = solanaWallet?.data?.wallet_address || ''

  // Stripe Connect status for the payment tab card (#434)
  const tenantId = await getCurrentTenantId()
  const { data: tenant } = await createAdminClient()
    .from('tenants')
    .select('stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
    .eq('id', tenantId)
    .single()
  const stripeAccountId = tenant?.stripe_account_id ?? null
  let connectStatus = {
    chargesEnabled: tenant?.stripe_charges_enabled ?? false,
    payoutsEnabled: tenant?.stripe_payouts_enabled ?? false,
    detailsSubmitted: tenant?.stripe_details_submitted ?? false,
  }
  // While Express onboarding is incomplete, pull live status from Stripe so
  // the card is fresh right after the admin returns from the hosted flow
  // (webhook lag / local dev without webhooks). Falls back to DB state (#439).
  if (stripeAccountId && !connectStatus.chargesEnabled) {
    connectStatus = (await syncConnectAccountStatus(tenantId, stripeAccountId)) ?? connectStatus
  }

  // Deep link support: /dashboard/admin/settings?tab=payment
  const { tab } = await searchParams
  const validTabs = ['general', 'email', 'payment', 'enrollment']
  const defaultTab = tab && validTabs.includes(tab) ? tab : 'general'

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
          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList className="flex w-full overflow-x-auto lg:w-auto">
              <TabsTrigger value="general">{t('tabs.general')}</TabsTrigger>
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
              {/* Stripe Connect status lives here so payment setup is one page (#434) */}
              <div className="mb-6">
                <StripeConnectCard
                  accountId={stripeAccountId}
                  chargesEnabled={connectStatus.chargesEnabled}
                  payoutsEnabled={connectStatus.payoutsEnabled}
                  detailsSubmitted={connectStatus.detailsSubmitted}
                />
              </div>
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

              {/* Solana receiving wallet — one address backs both the one-time
                  `solana` and auto-pull `solana_subs` providers. */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>{t('sections.solanaWallet.title')}</CardTitle>
                  <CardDescription>
                    {t('sections.solanaWallet.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SolanaWalletForm initialAddress={solanaWalletAddress} />
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
