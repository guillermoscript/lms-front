import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { EMAIL_NOT_VERIFIED_ERROR } from '@/lib/auth/require-verified-email'

type ConnectLinkResult =
  | { url: string }
  | { error: string; status: number }

/**
 * Shared logic for both handlers: auth → tenant → admin guard →
 * find-or-create Stripe account → account link.
 */
async function createConnectLink(req: NextRequest): Promise<ConnectLinkResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }

  // Email verification is async at signup (issue #436), but payout setup
  // requires a verified email.
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: EMAIL_NOT_VERIFIED_ERROR }, { status: 403 })
  }

  const tenantId = await getCurrentTenantId()
  if (!tenantId) {
    return { error: 'No tenant context', status: 400 }
  }

  // Verify user is tenant admin
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (tenantUser?.role !== 'admin') {
    return { error: 'Only tenant admins can connect Stripe', status: 403 }
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

  return { url: accountLink.url }
}

/**
 * POST /api/stripe/connect
 * Returns the Stripe Connect onboarding link as JSON.
 */
export async function POST(req: NextRequest) {
  const result = await createConnectLink(req)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ url: result.url })
}

/**
 * GET /api/stripe/connect
 * Browser-navigation entry point (used by plain links/window.location):
 * redirects straight to the Stripe hosted onboarding link, or back to the
 * monetization page with ?stripe=error on failure.
 */
export async function GET(req: NextRequest) {
  let result: ConnectLinkResult
  try {
    result = await createConnectLink(req)
  } catch (err) {
    console.error('[stripe/connect] failed to create account link:', err)
    result = { error: 'stripe_error', status: 500 }
  }
  if ('error' in result) {
    // Build the origin from the Host header — behind the tenant proxy,
    // req.nextUrl.origin resolves to the internal host (localhost) and the
    // redirect would drop the tenant subdomain (and with it the session).
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
    const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
    const back = new URL('/dashboard/admin/monetization', `${proto}://${host}`)
    back.searchParams.set('stripe', 'error')
    back.searchParams.set('reason', String(result.status))
    return NextResponse.redirect(back)
  }
  return NextResponse.redirect(result.url)
}
