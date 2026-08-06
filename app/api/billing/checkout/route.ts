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
import type { PaymentProvider } from '@/lib/payments/types'
import {
  describeResolutionError,
  getActivePlanPrices,
  getPlatformBillingProvider,
  resolveCheckoutProvider,
} from '@/lib/billing/platform-billing'

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
      .select('plan_id, slug, name')
      .eq('plan_id', planId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (plan.slug === 'free') {
      return NextResponse.json({ error: 'Cannot subscribe to free plan via checkout' }, { status: 400 })
    }

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
    })

    if (!resolved.ok) {
      return NextResponse.json(
        { error: describeResolutionError(resolved.error, interval) },
        { status: 400 },
      )
    }

    const { provider, price } = resolved.value

    // Changing plan on the SAME provider is an in-app subscription update
    // (proration preview + swap), not a second checkout — starting one here
    // would leave the school paying for two subscriptions at once.
    if (liveSub && liveSub.payment_provider === provider) {
      return NextResponse.json(
        { error: 'You already have an active subscription on this payment method. Change your plan from the billing page instead.' },
        { status: 400 },
      )
    }

    const capabilities = PROVIDER_CAPABILITIES[provider]
    if (!capabilities?.supportsPlatformBillingCheckout) {
      return NextResponse.json(
        { error: `${provider} cannot be used to pay for a platform plan.` },
        { status: 400 },
      )
    }

    const paymentProvider = getPlatformBillingProvider(provider)
    if (!paymentProvider.createCheckoutSession) {
      return NextResponse.json(
        { error: `${provider} does not support checkout yet.` },
        { status: 501 },
      )
    }

    // Provider switch: supersede the live subscription before starting the new
    // one, so the school is never billed on two rails at once. Cancelling
    // immediately (rather than at period end) is the safe direction — the new
    // checkout starts a fresh paid period, and a lingering old subscription
    // would auto-renew into a double charge. Mirrors the student supersession
    // model from #463.
    if (liveSub) {
      const oldCaps = PROVIDER_CAPABILITIES[liveSub.payment_provider as PaymentProvider]
      if (oldCaps?.supportsNativeSubscriptions) {
        try {
          const oldProvider = getPlatformBillingProvider(liveSub.payment_provider as PaymentProvider)
          if (oldProvider.cancelSubscription) {
            await oldProvider.cancelSubscription(liveSub.provider_subscription_id!, true)
          }
        } catch (err) {
          // Fail the request rather than the school: if we cannot stop the old
          // subscription, starting a second one is how double-billing happens.
          console.error('[billing/checkout] failed to cancel superseded subscription:', err)
          return NextResponse.json(
            { error: 'Could not cancel your current subscription. Contact support before switching payment methods.' },
            { status: 502 },
          )
        }
      }

      await adminClient
        .from('platform_subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
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

    const session = await paymentProvider.createCheckoutSession({
      mode: 'subscription',
      hosted: true,
      providerPriceId: price.providerPriceId,
      // The provider charges what its own price row says; this is carried for
      // adapters that need an explicit amount (hosted pages that do not read it
      // off the price object).
      amount: price.amount ?? 0,
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
      },
    })

    if (!session.url) {
      console.error(`[billing/checkout] ${provider} returned a ${session.kind} session with no URL`)
      return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
    }

    return NextResponse.json({ url: session.url, provider })
  } catch (error) {
    console.error('[billing/checkout] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
