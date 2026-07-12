/**
 * Standalone renewal-pull test for native Solana auto-pull subscriptions.
 *
 * Replicates exactly what the /api/cron/solana-pull crank does for ONE
 * subscription, but as a self-contained script — NO dev server, NO CRON_SECRET
 * needed. Run it any time after a subscription's on-chain period has elapsed to
 * prove the recurring charge fires:
 *   1. reads the on-chain SubscriptionDelegation (period start/end, due?),
 *   2. prints token balances before,
 *   3. pulls the split (school share + platform fee) via the puller keypair,
 *   4. prints balances after,
 *   5. extends the DB period (best-effort; skipped if local Supabase is down).
 *
 * The on-chain program enforces the per-period cap: if the period has NOT
 * elapsed, the pull reverts (PERIOD_NOT_ELAPSED) and the script says so — it can
 * never double-charge.
 *
 * Usage:  npx tsx scripts/devnet-renew.ts [planId]      (default planId 10007)
 *   or:   npm run devnet:renew
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { getBase58Encoder } from '@solana/kit'
import { readFileSync } from 'node:fs'
import {
  getSubscriptionState,
  deriveSubscriptionPda,
} from '../lib/payments/solana-subscriptions'
import { pullSplitForSubscription } from '../lib/payments/solana-subscription-pull'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k: string, required = true): string => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  if (!m && required) throw new Error(`missing ${k} in .env.local`)
  return m ? m[1].trim() : ''
}

const RPC = get('SOLANA_RPC_URL')
const pullerSecret = get('SOLANA_PULLER_SECRET_KEY')
const mint = get('SOLANA_USDC_MINT')
const platformWallet = get('SOLANA_PLATFORM_WALLET')
const SCHOOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL', false)
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY', false)

const planId = BigInt(process.argv[2] || '10007')
const price = 1
const platformPercent = 20

const conn = new Connection(RPC, 'confirmed')
const subscriber = Keypair
  .fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL('./.devnet-subscriber.json', import.meta.url), 'utf8'))))
  .publicKey.toBase58()
const merchant = Keypair
  .fromSecretKey(new Uint8Array(getBase58Encoder().encode(pullerSecret)))
  .publicKey.toBase58()

const mintPk = new PublicKey(mint)
const atas: Record<string, string> = {
  subscriber: getAssociatedTokenAddressSync(mintPk, new PublicKey(subscriber)).toBase58(),
  school: getAssociatedTokenAddressSync(mintPk, new PublicKey(SCHOOL)).toBase58(),
  platform: getAssociatedTokenAddressSync(mintPk, new PublicKey(platformWallet)).toBase58(),
}

async function bal(ata: string): Promise<string> {
  try { return (await conn.getTokenAccountBalance(new PublicKey(ata))).value.uiAmountString ?? '0' }
  catch { return 'n/a' }
}
async function printBalances(label: string) {
  console.log(`\n${label}`)
  for (const k of Object.keys(atas)) console.log(`  ${k.padEnd(10)} ${await bal(atas[k])}`)
}

;(async () => {
  console.log('plan       :', planId.toString())
  console.log('subscriber :', subscriber)
  console.log('merchant   :', merchant)

  const state = await getSubscriptionState({ rpcUrl: RPC, merchant, planId, subscriber })
  if (!state) { console.error('No on-chain subscription found for this plan+subscriber.'); process.exit(1) }

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const periodEnd = state.currentPeriodStartTs + state.periodHours * BigInt(3600)
  const due = nowSec >= periodEnd
  console.log('\non-chain state:')
  console.log('  periodHours        :', state.periodHours.toString())
  console.log('  currentPeriodStart :', state.currentPeriodStartTs.toString(), '(' + new Date(Number(state.currentPeriodStartTs) * 1000).toISOString() + ')')
  console.log('  periodEnd          :', periodEnd.toString(), '(' + new Date(Number(periodEnd) * 1000).toISOString() + ')')
  console.log('  now                :', nowSec.toString())
  console.log('  DUE FOR RENEWAL?   :', due ? 'YES ✓' : 'no — not elapsed yet')

  if (!due) {
    const waitMin = Math.ceil(Number(periodEnd - nowSec) / 60)
    console.log(`\nNot due yet — try again in ~${waitMin} min. (The on-chain program would reject an early pull.)`)
    process.exit(0)
  }

  await printBalances('balances BEFORE renewal pull:')

  console.log('\npulling split (school share + platform fee)…')
  await pullSplitForSubscription({
    rpcUrl: RPC,
    pullerSecretKeyBase58: pullerSecret,
    subscriber,
    merchant,
    planId,
    mint,
    schoolWallet: SCHOOL,
    platformWallet,
    priceMajor: price,
    platformPercent,
  })
  console.log('pull complete ✓')

  await printBalances('balances AFTER renewal pull:')

  // Best-effort DB period extension (skipped if local Supabase is unreachable).
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const admin = createClient(SUPABASE_URL, SERVICE_KEY)
      const subId = await deriveSubscriptionPda(merchant, planId, subscriber)
      const newEnd = new Date((Number(periodEnd) + Number(state.periodHours) * 3600) * 1000).toISOString()
      const { error } = await admin.rpc('extend_subscription_period', {
        _provider_subscription_id: subId,
        _provider: 'solana_subs',
        _new_period_end: newEnd,
      })
      console.log(error ? `\nDB extend skipped/failed: ${error.message}` : `\nDB period extended → ${newEnd} ✓`)
    } catch (e) {
      console.log('\nDB extend skipped (Supabase unreachable):', e instanceof Error ? e.message : String(e))
    }
  }

  console.log('\nRENEWAL OK ✓ — the recurring charge fired on-chain.')
})()
