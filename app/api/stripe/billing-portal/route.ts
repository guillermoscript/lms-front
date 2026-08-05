import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { resolveRequestLocale } from '@/lib/i18n/request-locale'

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

    // Get tenant's Stripe customer ID (per-provider since #601)
    const { data: billingCustomer } = await adminClient
      .from('tenant_billing_customers')
      .select('provider_customer_id')
      .eq('tenant_id', tenantId)
      .eq('payment_provider', 'stripe')
      .maybeSingle()

    if (!billingCustomer?.provider_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
    }

    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
    const locale = resolveRequestLocale(req, bodyLocale)
    const returnUrl = `${origin}/${locale}/dashboard/admin/billing`

    const session = await getStripe().billingPortal.sessions.create({
      customer: billingCustomer.provider_customer_id,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
