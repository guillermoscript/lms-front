import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { resolveRequestLocale } from '@/lib/i18n/request-locale'
import { getPaymentProvider } from '@/lib/payments'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

/**
 * Open the school's subscription-management page on whichever provider bills it.
 *
 * Replaces `/api/stripe/billing-portal` (#604). A hosted portal is a provider
 * ABILITY (`supportsCustomerPortal`), not a property of Stripe: a school on
 * Lemon Squeezy, bank transfer or a crypto rail has no such page, and this
 * route says so plainly instead of raising an unhandled SDK error. The billing
 * screen gates the button on the same capability, so reaching the 400 below
 * means something is out of step rather than a school clicking a dead button.
 */
export async function POST(req: NextRequest) {
  try {
    // Optional JSON body carrying the caller's locale; tolerate an empty body.
    let bodyLocale: unknown
    try {
      bodyLocale = (await req.json())?.locale
    } catch {
      bodyLocale = undefined
    }

    const supabase = await createClient()
    const adminClient = await createAdminClient()
    const tenantId = await getCurrentTenantId()

    // Verify user is authenticated and is tenant admin
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

    // Which provider bills this school decides whether a portal exists at all.
    const { data: subscription } = await adminClient
      .from('platform_subscriptions')
      .select('payment_provider, provider_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
    }

    const provider = subscription.payment_provider as PaymentProvider
    const capabilities = PROVIDER_CAPABILITIES[provider]
    if (!capabilities?.supportsCustomerPortal) {
      return NextResponse.json(
        {
          error: 'This payment method has no self-serve billing portal.',
          code: 'portal_unsupported',
        },
        { status: 400 },
      )
    }

    // Customer ids live per-provider since #601 — read the one for THIS provider.
    const { data: billingCustomer } = await adminClient
      .from('tenant_billing_customers')
      .select('provider_customer_id')
      .eq('tenant_id', tenantId)
      .eq('payment_provider', provider)
      .maybeSingle()

    const providerCustomerId =
      billingCustomer?.provider_customer_id || subscription.provider_customer_id
    if (!providerCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
    }

    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
    const locale = resolveRequestLocale(req, bodyLocale)
    const returnUrl = `${origin}/${locale}/dashboard/admin/billing`

    const paymentProvider = getPaymentProvider(provider)
    if (!paymentProvider.createCustomerPortalSession) {
      throw new Error(`${provider} declares supportsCustomerPortal but implements no portal session`)
    }
    const session = await paymentProvider.createCustomerPortalSession({
      providerCustomerId,
      returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
