import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planId, interval = 'monthly' } = body

    if (!planId) {
      return NextResponse.json({ error: 'Missing plan ID' }, { status: 400 })
    }

    if (!['monthly', 'yearly'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
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

    // Check for existing active subscription
    const { data: existingSub } = await adminClient
      .from('platform_subscriptions')
      .select('subscription_id, stripe_subscription_id, status, payment_method')
      .eq('tenant_id', tenantId)
      .single()

    // Block only if there's an active Stripe subscription (not manual)
    // Allow checkout when switching from manual_transfer to Stripe
    if (
      existingSub?.stripe_subscription_id &&
      existingSub.status === 'active' &&
      existingSub.payment_method !== 'manual_transfer'
    ) {
      return NextResponse.json(
        { error: 'Active subscription exists. Use billing portal to change plans.' },
        { status: 400 }
      )
    }

    // Get the plan
    const { data: plan, error: planError } = await adminClient
      .from('platform_plans')
      .select('*')
      .eq('plan_id', planId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (plan.slug === 'free') {
      return NextResponse.json({ error: 'Cannot subscribe to free plan via checkout' }, { status: 400 })
    }

    const stripePriceId = interval === 'yearly'
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly

    if (!stripePriceId) {
      return NextResponse.json(
        { error: 'Stripe price not configured for this plan. Please contact support.' },
        { status: 400 }
      )
    }

    // Get or create Stripe customer for the tenant (platform billing)
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('stripe_customer_id, billing_email, name')
      .eq('id', tenantId)
      .single()

    let stripeCustomerId = tenant?.stripe_customer_id
    const stripe = getStripe()

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: tenant?.billing_email || user.email,
        name: tenant?.name || undefined,
        metadata: {
          tenant_id: tenantId,
          created_by: user.id,
        },
      })
      stripeCustomerId = customer.id

      await adminClient
        .from('tenants')
        .update({
          stripe_customer_id: stripeCustomerId,
          billing_email: tenant?.billing_email || user.email,
        })
        .eq('id', tenantId)
    }

    // Determine success/cancel URLs
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
    const successUrl = `${origin}/en/dashboard/admin/billing?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}/en/dashboard/admin/billing/upgrade`

    // Create Stripe Checkout Session (platform billing, NOT Connect)
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: planId,
        plan_slug: plan.slug,
        interval,
      },
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          plan_id: planId,
          plan_slug: plan.slug,
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
