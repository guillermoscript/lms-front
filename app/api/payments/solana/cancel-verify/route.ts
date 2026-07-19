/**
 * Confirm an on-chain subscription cancel and finalize the DB row (issue #460).
 *
 * After the student signs the cancel tx (from /cancel-tx) and submits it through
 * /submit, this route reads the on-chain SubscriptionDelegation and, if it is
 * now cancelled (expiresAtTs != 0), marks our subscription row `canceled`. The
 * crank already refuses to charge any non-active row, so this closes the loop:
 * the delegation is revoked on-chain AND our records agree.
 *
 * Auth: the caller must be signed in AND own the subscription (resolved through
 * the RLS server client filtered by user_id). The status write uses the service
 * role because subscription status is not student-writable under RLS — ownership
 * is already proven by the RLS-scoped select above.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscriptionState } from '@/lib/payments/solana-subscriptions'
import { paymentAuthLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

interface SolanaSubMeta {
  subscriber?: string
  merchant?: string
  planId?: string
  mint?: string
}

export async function POST(req: NextRequest) {
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
    if (!subscriptionId || typeof subscriptionId !== 'number') {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })
    }

    // RLS + explicit user filter: the caller can only reach their own row.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('subscription_id, payment_provider, provider_metadata')
      .eq('subscription_id', subscriptionId)
      .eq('user_id', user.id)
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

    // Ownership is already proven above; use the service role to write the status
    // (not student-writable under RLS).
    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from('subscriptions')
      .update({ subscription_status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('subscription_id', subscriptionId)

    if (updateError) {
      console.error('[solana/cancel-verify] db update error:', updateError)
      return NextResponse.json({ error: 'Failed to finalize cancellation' }, { status: 500 })
    }

    return NextResponse.json({ canceled: true })
  } catch (error) {
    console.error('[solana/cancel-verify] error:', error)
    const message = error instanceof Error ? error.message : 'Cancel verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
