/**
 * Crank cron for native Solana auto-pull subscriptions (issue #280).
 *
 * The on-chain Subscriptions program has NO scheduler — WE pull each period.
 * For every active `solana_subs` subscription whose on-chain period has rolled
 * over, this submits TWO pulls (school share + platform fee = the split, since a
 * single pull targets one receiver), then extends our DB period. The on-chain
 * program enforces the per-period cap, so an early/duplicate pull reverts
 * harmlessly and we simply skip that row.
 *
 * Run on a schedule (e.g. hourly) via Vercel Cron. Secured by CRON_SECRET.
 * Requires: SOLANA_RPC_URL, SOLANA_PULLER_SECRET_KEY (base58 of the whitelisted
 * puller keypair, must hold SOL for fees), SOLANA_PLATFORM_WALLET,
 * SOLANA_USDC_MINT (native subs are SPL — pulls are token transfers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSubscriptionState } from '@/lib/payments/solana-subscriptions'
import { pullSplitForSubscription } from '@/lib/payments/solana-subscription-pull'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

interface SolanaSubMeta {
  subscriber: string
  merchant: string
  planId: string // bigint serialized as string in jsonb
  mint: string
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  const mintEnv = process.env.SOLANA_USDC_MINT
  if (!rpcUrl || !pullerSecret || !platformWallet || !mintEnv) {
    return NextResponse.json({ error: 'Solana subscriptions not configured' }, { status: 503 })
  }

  const admin = getSupabaseAdmin()

  // Active native-subscription rows, with their on-chain coordinates + amount.
  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('subscription_id, tenant_id, plan_id, provider_metadata, plans(price)')
    .eq('payment_provider', 'solana_subs')
    .eq('subscription_status', 'active')

  if (error) {
    console.error('[solana-pull] query error', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
  if (!subs?.length) return NextResponse.json({ pulled: 0 })

  const nowSec = Math.floor(Date.now() / 1000)
  let pulled = 0
  const errors: string[] = []

  for (const sub of subs) {
    const meta = sub.provider_metadata as SolanaSubMeta | null
    if (!meta?.subscriber || !meta.merchant || !meta.planId) continue
    const planId = BigInt(meta.planId)

    try {
      // Is the on-chain period due? (period rolled over since last pull.)
      const state = await getSubscriptionState({ rpcUrl, merchant: meta.merchant, planId, subscriber: meta.subscriber })
      if (!state) {
        errors.push(`sub ${sub.subscription_id}: no on-chain account`)
        continue
      }
      if (state.expiresAtTs !== BigInt(0) && state.expiresAtTs <= BigInt(nowSec)) {
        // Cancelled and past grace — expire our row (trigger revokes access).
        await admin.from('subscriptions').update({ subscription_status: 'expired' }).eq('subscription_id', sub.subscription_id)
        continue
      }
      const periodEndSec = state.currentPeriodStartTs + state.periodHours * BigInt(3600)
      if (BigInt(nowSec) < periodEndSec) continue // not due yet

      // Split the per-period amount (school remainder + platform floor).
      const price = Number((sub.plans as { price?: number } | null)?.price ?? 0)

      // School receiver wallet from the tenant config.
      const { data: wallet } = await admin
        .from('tenant_payment_wallets').select('wallet_address')
        .eq('tenant_id', sub.tenant_id).eq('provider', 'solana_subs').maybeSingle()
      const schoolWalletStr = wallet?.wallet_address
      if (!schoolWalletStr) { errors.push(`sub ${sub.subscription_id}: no school wallet`); continue }

      // Two pulls = the split. Both must be within the per-period cap (sum = price).
      await pullSplitForSubscription({
        rpcUrl,
        pullerSecretKeyBase58: pullerSecret,
        subscriber: meta.subscriber,
        merchant: meta.merchant,
        planId,
        mint: mintEnv,
        schoolWallet: schoolWalletStr,
        platformWallet,
        priceMajor: price,
        platformPercent: await platformPercent(admin, sub.tenant_id),
      })

      // Extend our DB access window by one period (entitlements + period end).
      const newEnd = new Date((Number(periodEndSec) + Number(state.periodHours) * 3600) * 1000).toISOString()
      await admin.rpc('extend_subscription_period', {
        _provider_subscription_id: await onchainSubId(meta),
        _provider: 'solana_subs',
        _new_period_end: newEnd,
      })
      pulled++
    } catch (err) {
      errors.push(`sub ${sub.subscription_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length) console.warn('[solana-pull] errors:', errors)
  return NextResponse.json({ pulled, errors: errors.length })
}

async function platformPercent(admin: ReturnType<typeof getSupabaseAdmin>, tenantId: string): Promise<number> {
  const { data } = await admin.from('revenue_splits').select('platform_percentage').eq('tenant_id', tenantId).maybeSingle()
  return Number(data?.platform_percentage ?? 20)
}

// The subscription's stable match key for extend_subscription_period: the
// on-chain SubscriptionDelegation PDA (unique per subscriber+plan). Stored as
// provider_subscription_id on the subscription at creation.
async function onchainSubId(meta: SolanaSubMeta): Promise<string> {
  const { deriveSubscriptionPda } = await import('@/lib/payments/solana-subscriptions')
  return deriveSubscriptionPda(meta.merchant, BigInt(meta.planId), meta.subscriber)
}
