/** Verify revocation, stop future charges and retain the verified paid period.
 * Ownership, school and origin are checked before privileged work.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscriptionState } from '@/lib/payments/solana-subscriptions'
import { paymentAuthLimiter } from '@/lib/rate-limit'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { applySubscriptionCancellation } from '@/lib/payments/subscription-cancellation'
import { renewSolanaSubscription, type SolanaRenewalRow } from '@/lib/payments/solana-renewal'

export const runtime = 'nodejs'

interface SolanaSubMeta {
  subscriber?: string
  merchant?: string
  planId?: string
  mint?: string
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin || origin !== `${req.nextUrl.protocol}//${req.headers.get('host')}`) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentAuthLimiter.check(10, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const subscriptionId = body?.subscriptionId
    if (!Number.isSafeInteger(subscriptionId) || subscriptionId <= 0) {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })
    }

    const tenantId = await getCurrentTenantId()
    // Scope ownership to the school resolved from the request hostname.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('subscription_id, payment_provider, provider_metadata, start_date, tenant_id, plan_id, subscription_status, cancel_at_period_end, cancel_at, provider_subscription_id, plans(price)')
      .eq('subscription_id', subscriptionId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }
    if (sub.payment_provider !== 'solana_subs') {
      return NextResponse.json({ error: 'Not a Solana subscription' }, { status: 400 })
    }

    const meta = (sub.provider_metadata ?? {}) as SolanaSubMeta
    if (!meta.subscriber || !meta.merchant || !meta.planId) {
      return NextResponse.json(
        { error: 'Subscription is missing its on-chain coordinates' },
        { status: 400 },
      )
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana not configured' }, { status: 503 })
    }

    const state = await getSubscriptionState({
      rpcUrl,
      merchant: meta.merchant,
      planId: BigInt(meta.planId),
      subscriber: meta.subscriber,
    })

    // The account is gone, or its cancel flag is set → the delegation is revoked.
    const canceledOnChain = !state || state.expiresAtTs !== BigInt(0)
    if (!canceledOnChain) {
      return NextResponse.json({ canceled: false })
    }

    const admin = createAdminClient()
    // A renewal can land before cancellation but fail to persist its receipt.
    // Reconcile it without debiting before choosing the paid-access deadline.
    if (state) await renewSolanaSubscription(admin, sub as SolanaRenewalRow, { recoveryOnly: true })
    const deadline = await applySubscriptionCancellation(admin, subscriptionId, {
      result: { mode: 'period_end', ...(state ? { effectiveAt: new Date(Number(state.expiresAtTs) * 1000) } : {}) },
    })
    return NextResponse.json({ canceled: true, paidThrough: deadline })
  } catch (error) {
    console.error('[solana/cancel-verify] error:', error)
    return NextResponse.json({ error: 'Cancellation verification is unresolved. Check cancellation again before submitting another transaction.', recoveryRequired: true }, { status: 503 })
  }
}
