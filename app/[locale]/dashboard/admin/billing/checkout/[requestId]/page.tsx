/**
 * Solana checkout for a platform plan (#610) or a platform-fee payment (#950).
 *
 * A crypto rail has no hosted page to redirect to, so this IS the checkout: the
 * QR the school scans, and the poll that waits for the chain. It is a page and
 * not a dialog on the upgrade screen because a payment already in flight must
 * survive a reload — the QR is rebuilt from the request's stored reference, so
 * coming back to this URL shows the same payment rather than starting a second
 * one.
 *
 * The request is read under the CALLER's RLS: `platform_payment_requests`
 * exposes a row only to active admins of its own tenant, so authorization for
 * this page is the same policy that guards the data, with nothing to keep in
 * step.
 *
 * A fee request (`fee_payment_id` set, no plan) shows the fee copy and returns
 * to Earnings, where the paid balance lives, instead of Billing.
 */

import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { encodeURL } from '@solana/pay'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { createClient } from '@/lib/supabase/server'
import { formatSettlement } from '@/lib/billing/solana-platform-payment'
import { isRequestOpen } from '@/lib/billing/payment-request-ttl'
import { SolanaCheckoutClient } from './solana-checkout-client'

export default async function PlatformSolanaCheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>
}) {
  const { locale, requestId } = await params
  const t = await getTranslations('dashboard.admin.billing.cryptoCheckout')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const tEarnings = await getTranslations('dashboard.admin.earnings')

  const supabase = await createClient()
  const { data: request } = await supabase
    .from('platform_payment_requests')
    .select(
      'request_id, status, activation_state, amount, interval, expires_at, payment_provider, provider_reference, settlement_currency, settlement_base, settlement_mint, fee_payment_id, platform_plans(name)',
    )
    .eq('request_id', requestId)
    .maybeSingle()

  if (!request || request.payment_provider !== 'solana' || !request.provider_reference) {
    notFound()
  }

  const kind = request.fee_payment_id ? 'fee' : 'plan'
  const returnHref = `/${locale}/dashboard/admin/${kind === 'fee' ? 'earnings' : 'billing'}`

  // Already paid — there is nothing to show but the page it settled.
  if (request.status === 'confirmed' || request.activation_state === 'activated') {
    redirect(returnHref)
  }

  const plan = request.platform_plans as unknown as { name: string } | { name: string }[] | null
  const planName = (Array.isArray(plan) ? plan[0] : plan)?.name ?? ''

  // The tenant's own origin, not NEXT_PUBLIC_APP_URL: the wallet resolves this
  // link itself, and a QR built with another tenant's host fails for everyone
  // but that tenant.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') || host.includes('lvh.me') ? 'http' : 'https')
  // Same shape SolanaProvider.createCheckoutSession mints for `hosted` — the
  // published contract of /api/billing/solana/tx, which reads the reference off
  // the query string.
  const link = new URL(`${proto}://${host}/api/billing/solana/tx`)
  link.searchParams.set('reference', request.provider_reference)
  // Lets /tx word the wallet message in the school's language — the wallet
  // calls it with no session to read a locale from.
  link.searchParams.set('locale', locale)
  const payUrl = encodeURL({ link }).toString()

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="platform-solana-checkout">
      <AdminBreadcrumb
        items={
          kind === 'fee'
            ? [
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tEarnings('title'), href: '/dashboard/admin/earnings' },
                { label: t('breadcrumb') },
              ]
            : [
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('billing'), href: '/dashboard/admin/billing' },
                { label: t('breadcrumb') },
              ]
        }
      />

      <SolanaCheckoutClient
        kind={kind}
        requestId={request.request_id}
        planName={planName}
        interval={request.interval === 'yearly' ? 'yearly' : 'monthly'}
        amountUsd={Number(request.amount)}
        settlementLabel={formatSettlement(request)}
        payUrl={payUrl}
        expired={!isRequestOpen(request as { status: string; expires_at: string | null })}
        returnHref={returnHref}
      />
    </div>
  )
}
