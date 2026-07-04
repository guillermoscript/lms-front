/**
 * Create an on-chain Subscriptions Plan with a CUSTOM (short) period, for
 * testing the recurring auto-pull without waiting a full billing cycle.
 *
 * The normal checkout path derives periodHours = duration_in_days * 24 (min 24h
 * for whole-day plans). This calls ensurePlanOnChain directly so we can set a
 * ~1h period. The matching DB plan row (same plan_id) is created separately via
 * SQL; ensurePlanOnChain is idempotent, so the checkout route will reuse this
 * on-chain plan instead of recreating it with a 24h period.
 *
 * Usage:  npx tsx scripts/devnet-create-short-plan.ts <planId> [periodHours]
 *   e.g.  npx tsx scripts/devnet-create-short-plan.ts 10007 1
 */

import { Keypair } from '@solana/web3.js'
import { getBase58Encoder } from '@solana/kit'
import { readFileSync } from 'node:fs'
import { ensurePlanOnChain } from '../lib/payments/solana-subscriptions'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k: string): string => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  if (!m) throw new Error(`missing ${k} in .env.local`)
  return m[1].trim()
}

const RPC = get('SOLANA_RPC_URL')
const pullerSecret = get('SOLANA_PULLER_SECRET_KEY')
const mint = get('SOLANA_USDC_MINT')
const platformWallet = get('SOLANA_PLATFORM_WALLET')
// Tenant (Code Academy) solana_subs receiving wallet — must match what the
// crank/verify read from tenant_payment_wallets, else renewals revert.
const SCHOOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

const planId = BigInt(process.argv[2])
const periodHours = BigInt(process.argv[3] || '1')
const amountBase = 1_000_000n // 1.000000 token (6 decimals)

const merchant = Keypair
  .fromSecretKey(new Uint8Array(getBase58Encoder().encode(pullerSecret)))
  .publicKey.toBase58()

;(async () => {
  console.log('planId      :', planId.toString())
  console.log('periodHours :', periodHours.toString())
  console.log('merchant    :', merchant)
  console.log('mint        :', mint)
  console.log('destinations:', [SCHOOL, platformWallet])

  const res = await ensurePlanOnChain({
    rpcUrl: RPC,
    pullerSecretKeyBase58: pullerSecret,
    planId,
    mint,
    amountBase,
    periodHours,
    destinations: [SCHOOL, platformWallet],
    pullers: [merchant],
  })

  console.log('\nresult:', res)
  console.log(res.created ? 'PLAN CREATED ✓' : 'plan already existed (no-op)')
})()
