import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { EMAIL_NOT_VERIFIED_ERROR } from '@/lib/auth/require-verified-email'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { isFirstConnectedProvider } from '@/lib/analytics/activation'

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
    return { error: EMAIL_NOT_VERIFIED_ERROR, status: 403 }
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
    // Express account: Stripe-hosted onboarding with progressive KYC — only
    // `currently_due` fields are asked upfront, so a school can start taking
    // payments in minutes (#439). Existing tenants keep their standard
    // accounts; this branch only runs when the tenant has no account yet.
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { tenant_id: tenantId },
    })
    accountId = account.id

    // Save account ID to tenant
    await supabase
      .from('tenants')
      .update({ stripe_account_id: accountId })
      .eq('id', tenantId)

    // Minting the Express account is the once-per-tenant moment on this route —
    // it happens exactly when `stripe_account_id` goes from null to set, so
    // re-opening the onboarding link later cannot re-fire it.
    //
    // `connect_ready: false` is not a placeholder: this runs BEFORE the admin is
    // handed the hosted onboarding link, so the account provably cannot charge
    // yet. That gap is the whole subject of PR #617 — pairing this event with
    // the later `charges_enabled` flip is how we count the owners who stall at
    // the gate. The flip itself is mirrored by the `account.updated` webhook and
    // `syncConnectAccountStatus()`, neither of which is instrumented here;
    // `evaluateSchoolActivation()` therefore must also be called from whichever
    // of those lands, or a Stripe-only school activates late (at its next
    // publish) rather than at the moment it became payable.
    await track(
      ANALYTICS_EVENTS.PAYMENT_PROVIDER_CONNECTED,
      {
        provider: 'stripe',
        is_first_provider: await isFirstConnectedProvider(tenantId, 'stripe'),
        connect_ready: false,
        account_type: 'express',
      },
      { userId: user.id, tenantId, role: 'admin' }
    )
  }

  // Create account link for onboarding. Build the origin from forwarded
  // headers — behind the tenant proxy req.nextUrl.origin is the internal
  // host, which would drop the tenant subdomain on return from Stripe.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const origin = `${proto}://${host}`
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/admin/settings?tab=payment&stripe=refresh`,
    return_url: `${origin}/dashboard/admin/settings?tab=payment&stripe=connected`,
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
