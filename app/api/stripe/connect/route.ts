import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

/**
 * POST /api/stripe/connect
 * Creates a Stripe Connect account link for the current tenant admin.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = await getCurrentTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 })
  }

  // Verify user is tenant admin
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (tenantUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Only tenant admins can connect Stripe' }, { status: 403 })
  }

  // Check if tenant already has a Stripe account
  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_account_id')
    .eq('id', tenantId)
    .single()

  const stripe = getStripe()
  let accountId = tenant?.stripe_account_id

  if (!accountId) {
    // Create a new Stripe Connect account
    const account = await stripe.accounts.create({
      type: 'standard',
      metadata: { tenant_id: tenantId },
    })
    accountId = account.id

    // Save account ID to tenant
    await supabase
      .from('tenants')
      .update({ stripe_account_id: accountId })
      .eq('id', tenantId)
  }

  // Create account link for onboarding
  const { origin } = req.nextUrl
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/admin/settings?stripe=refresh`,
    return_url: `${origin}/dashboard/admin/settings?stripe=connected`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}
