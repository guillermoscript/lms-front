/**
 * Provider-agnostic checkout for school → platform billing (issue #603).
 *
 * Replaces `app/api/stripe/checkout-session`, which called
 * `stripe.checkout.sessions.create` directly. Everything provider-specific now
 * happens behind `IPaymentProvider.createCheckoutSession({ hosted: true })`,
 * capability-gated by `supportsPlatformBillingCheckout`.
 *
 * The guards are unchanged from the route it replaces — authenticated, active
 * admin of the tenant, no live non-manual subscription on the SAME provider,
 * never the free plan — with one deliberate addition: switching providers is
 * now a supported transition rather than a 400 (#600). A school whose card
 * starts failing has to be able to move to the rail it can actually pay on.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { resolveRequestLocale } from '@/lib/i18n/request-locale'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { getTenantPlatformProviderStatuses } from '@/lib/billing/platform-checkout-runtime'
import {
  describeResolutionError,
  getActivePlanPrices,
  getPlatformBillingProvider,
  resolveCheckoutProvider,
} from '@/lib/billing/platform-billing'
import { checkPlanLimits, formatPlanLimitError } from '@/lib/billing/plan-limits'
import { hasOpenPaymentRequest, requestExpiresAt } from '@/lib/billing/payment-request-ttl'
import {
  getPlatformSolanaConfig,
  quotePlatformSettlement,
  recordSolanaPlatformRequest,
  type PlatformSettlement,
} from '@/lib/billing/solana-platform-payment'
import {
  SWITCH_METADATA_KEY,
  SwitchAlreadyPendingError,
  attachSwitchCheckoutReference,
  beginPlatformSubscriptionSwitch,
  failPlatformSubscriptionSwitch,
} from '@/lib/billing/platform-subscription-switch'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planId, interval = 'monthly', locale: bodyLocale, provider: requestedProvider } = body

    if (!planId) {
      return NextResponse.json({ error: 'Missing plan ID' }, { status: 400 })
    }

    if (!['monthly', 'yearly'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
    }

    const supabase = await createClient()
    const adminClient = await createAdminClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only school admins can manage billing' }, { status: 403 })
    }

    const { data: plan, error: planError } = await adminClient
      .from('platform_plans')
      .select('plan_id, slug, name, price_monthly, price_yearly')
      .eq('plan_id', planId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (plan.slug === 'free') {
      return NextResponse.json({ error: 'Cannot subscribe to free plan via checkout' }, { status: 400 })
    }

    const providerStatuses = await getTenantPlatformProviderStatuses(adminClient, tenantId)
    const fallbackAmount = Number(interval === 'yearly' ? plan.price_yearly : plan.price_monthly) || 0

    const { data: existingSub } = await adminClient
      .from('platform_subscriptions')
      .select('subscription_id, provider_subscription_id, status, payment_provider')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    const liveSub =
      existingSub?.provider_subscription_id &&
      existingSub.status === 'active' &&
      existingSub.payment_provider !== 'manual'
        ? existingSub
        : null

    // Resolve which rail to charge on. Explicit choice wins; otherwise stay on
    // the provider already on file, and fall back to the only priced one.
    const prices = await getActivePlanPrices(adminClient, planId)
    const resolved = resolveCheckoutProvider(prices, interval, {
      requested: typeof requestedProvider === 'string' ? requestedProvider : undefined,
      tenantProvider: existingSub?.payment_provider ?? null,
      providerStatuses,
      expectedCurrency: 'usd',
      fallbackAmount,
    })

    if (!resolved.ok) {
      return NextResponse.json(
        { error: describeResolutionError(resolved.error, interval) },
        { status: 400 },
      )
    }

    const { provider, price } = resolved.value

    const capabilities = PROVIDER_CAPABILITIES[provider]
    if (!capabilities?.supportsPlatformBillingCheckout) {
      return NextResponse.json(
        { error: `${provider} cannot be used to pay for a platform plan.` },
        { status: 400 },
      )
    }

    // Changing plan on the SAME provider is an in-app subscription update
    // (proration preview + swap), not a second checkout — starting one here
    // would leave the school paying for two subscriptions at once.
    //
    // Only where the PROVIDER bills on a schedule, though (#610). On a rail
    // whose period we own, a second checkout on the same rail is not a second
    // subscription — it is how the school renews or moves plan at all, and
    // refusing it would leave a Binance/Solana subscriber with no way to pay
    // for their next month.
    if (liveSub && liveSub.payment_provider === provider && capabilities.supportsNativeSubscriptions) {
      return NextResponse.json(
        { error: 'You already have an active subscription on this payment method. Change your plan from the billing page instead.' },
        { status: 400 },
      )
    }

    // Pre-flight the target plan's limits on rails we cannot refund in-app.
    // A crypto transfer is final the moment it confirms, so "you are over the
    // limits of the plan you just paid for" has to be said BEFORE the QR or the
    // Binance page is shown — not at activation, the way a bank transfer's
    // super-admin confirm can say it (`confirmManualPayment`).
    if (capabilities.selfManagedPeriod) {
      const limitCheck = await checkPlanLimits(adminClient, tenantId, { planId })
      if (!limitCheck.ok) {
        return NextResponse.json(
          { error: formatPlanLimitError(limitCheck) || 'Plan limits exceeded' },
          { status: 400 },
        )
      }
    }

    // What the school owes, in USD. The price row's own amount wins — a rail
    // may be priced differently — and the plan's list price is the fallback for
    // a catalog-less row that carries no amount of its own.
    const listPrice = Number(interval === 'yearly' ? plan.price_yearly : plan.price_monthly) || 0
    const amountUsd = price.amount ?? listPrice
    if (!(amountUsd > 0)) {
      console.error(`[billing/checkout] ${provider} price for ${plan.slug}/${interval} resolves to 0`)
      return NextResponse.json({ error: 'This plan has no price to charge on that method.' }, { status: 400 })
    }

    // A crypto rail needs its intent recorded before the QR exists: the wallet
    // hits `/api/billing/solana/tx` with no session, and the only thing tying
    // that anonymous call to a school, a plan and an amount is this row.
    // Guarded like the manual request it is — one open promise to pay at a time,
    // or a school could hold a plan with a QR it never scans.
    //
    // Every reason to refuse is checked HERE, above the supersession below: that
    // step cancels the school's live subscription, and refusing afterwards would
    // leave it with neither the old plan nor the new one.
    let solanaSettlement: PlatformSettlement | null = null
    if (provider === 'solana') {
      const config = getPlatformSolanaConfig()
      if (!config) {
        return NextResponse.json(
          { error: 'Solana payments are not configured on this platform yet.' },
          { status: 503 },
        )
      }
      if (await hasOpenPaymentRequest(adminClient, tenantId)) {
        return NextResponse.json(
          { error: 'You already have a pending plan change request. Please wait for it to be processed.' },
          { status: 400 },
        )
      }
      solanaSettlement = await quotePlatformSettlement(amountUsd, config)
    }

    const paymentProvider = getPlatformBillingProvider(provider)
    if (!paymentProvider.createCheckoutSession) {
      return NextResponse.json(
        { error: `${provider} does not support checkout yet.` },
        { status: 501 },
      )
    }

    // Get or create the tenant's customer with this provider. Since #601 the id
    // lives per (tenant, provider) in tenant_billing_customers.
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('billing_email, name')
      .eq('id', tenantId)
      .single()

    const { data: billingCustomer } = await adminClient
      .from('tenant_billing_customers')
      .select('provider_customer_id')
      .eq('tenant_id', tenantId)
      .eq('payment_provider', provider)
      .maybeSingle()

    // Providers with no `ensureCustomer` do not keep a customer record for us —
    // a Merchant-of-Record hosted page collects the buyer's details itself — so
    // the checkout simply runs without one.
    let providerCustomerId = billingCustomer?.provider_customer_id

    if (!providerCustomerId && paymentProvider.ensureCustomer) {
      const created = await paymentProvider.ensureCustomer({
        userId: user.id,
        email: tenant?.billing_email || user.email || '',
        name: tenant?.name || undefined,
        metadata: { tenant_id: tenantId, created_by: user.id },
      })
      providerCustomerId = created.providerCustomerId

      await adminClient
        .from('tenant_billing_customers')
        .upsert(
          {
            tenant_id: tenantId,
            payment_provider: provider,
            provider_customer_id: providerCustomerId,
          },
          { onConflict: 'tenant_id,payment_provider' },
        )

      await adminClient
        .from('tenants')
        .update({ billing_email: tenant?.billing_email || user.email })
        .eq('id', tenantId)
    }

    // Locale-preserving return URLs. Load-bearing behind the tenant proxy: the
    // origin is the school's own subdomain, and dropping the locale segment
    // bounces the admin through a redirect that loses the session_id.
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
    const locale = resolveRequestLocale(req, bodyLocale)
    const successUrl = `${origin}/${locale}/dashboard/admin/billing?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}/${locale}/dashboard/admin/billing/upgrade`

    const replacementExpiresAt = provider === 'solana' ? requestExpiresAt() : undefined
    let switchId: string | null
    try {
      switchId = await beginPlatformSubscriptionSwitch({
        admin: adminClient,
        tenantId,
        targetPlanId: plan.plan_id,
        targetProvider: provider,
        targetInterval: interval,
        initiatedBy: user.id,
        expiresAt: replacementExpiresAt,
      })
    } catch (switchError) {
      if (switchError instanceof SwitchAlreadyPendingError) {
        return NextResponse.json({ error: switchError.message }, { status: 409 })
      }
      throw switchError
    }

    let session
    try {
      session = await paymentProvider.createCheckoutSession({
        mode: 'subscription',
        hosted: true,
        providerPriceId: price.providerPriceId ?? '',
        // The provider charges what its own price row says; this is carried for
        // adapters that need an explicit amount (hosted pages that do not read it
        // off the price object, and every catalog-less rail).
        amount: amountUsd,
        currency: price.currency,
        reference: `platform:${tenantId}:${plan.plan_id}`,
        providerCustomerId,
        successUrl,
        cancelUrl,
        baseUrl: origin || undefined,
        metadata: {
          tenant_id: tenantId,
          plan_id: plan.plan_id,
          plan_slug: plan.slug,
          interval,
          ...(switchId ? { [SWITCH_METADATA_KEY]: switchId } : {}),
        },
      })
    } catch (checkoutError) {
      await failPlatformSubscriptionSwitch(adminClient, switchId, checkoutError)
      throw checkoutError
    }

    if (!session.url) {
      console.error(`[billing/checkout] ${provider} returned a ${session.kind} session with no URL`)
      await failPlatformSubscriptionSwitch(adminClient, switchId, 'Provider returned no checkout URL')
      return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
    }

    await attachSwitchCheckoutReference(
      adminClient,
      switchId,
      session.providerRef ?? session.reference,
      session.expiresAt,
    )

    // The QR's on-chain reference is minted by the provider, so the row is
    // written now that we have it. A failure here must fail the request: a
    // scannable QR with no row behind it is a payment nobody can credit.
    if (solanaSettlement) {
      if (!session.providerRef) {
        console.error('[billing/checkout] solana session carried no on-chain reference')
        await failPlatformSubscriptionSwitch(adminClient, switchId, 'Solana session carried no reference')
        return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
      }
      let requestId: string
      try {
        const recorded = await recordSolanaPlatformRequest({
          admin: adminClient,
          tenantId,
          userId: user.id,
          planId: plan.plan_id,
          amountUsd,
          interval,
          reference: session.providerRef,
          settlement: solanaSettlement,
          switchId,
          expiresAt: replacementExpiresAt,
        })
        requestId = recorded.requestId
      } catch (recordError) {
        await failPlatformSubscriptionSwitch(adminClient, switchId, recordError)
        throw recordError
      }
      return NextResponse.json({ kind: session.kind, url: session.url, provider, requestId })
    }

    // `kind` is carried on every response so the client presents what it was
    // actually given rather than assuming a redirect — the two shapes differ by
    // more than a URL.
    return NextResponse.json({ kind: session.kind, url: session.url, provider })
  } catch (error) {
    console.error('[billing/checkout] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
