/**
 * Devnet subscriber signer for native auto-pull subscriptions (solana_subs).
 *
 * Acts as the subscriber's wallet: fetches the unsigned SUBSCRIBE transaction the
 * app builds (which also triggers server-side on-chain plan creation), signs it
 * with the subscriber keypair from setup, and submits to devnet. The browser
 * checkout page (polling /verify) then confirms the delegation and fires the
 * first split pull.
 *
 * Usage:  node scripts/devnet-subscribe.mjs <reference_pubkey>
 *   <reference_pubkey> = the transaction's provider_subscription_id (the random
 *   on-chain reference in the Solana Pay QR). Ask Claude for it after checkout.
 * Env:    BASE_URL (default http://code-academy.lvh.me:3005)
 *         SOLANA_RPC_URL (default https://api.devnet.solana.com)
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://code-academy.lvh.me:3005'
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const ref = process.argv[2]
if (!ref) {
  console.error('usage: node scripts/devnet-subscribe.mjs <reference_pubkey>')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const subPath = join(here, '.devnet-subscriber.json')
if (!existsSync(subPath)) {
  console.error('scripts/.devnet-subscriber.json not found — run scripts/devnet-subs-setup.mjs first.')
  process.exit(1)
}
const subscriber = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(subPath, 'utf8'))))
console.log('subscriber:', subscriber.publicKey.toBase58())

const conn = new Connection(RPC, 'confirmed')

// 1. Ask the app to build the unsigned SUBSCRIBE tx (also ensures the on-chain
//    plan exists, signed server-side by the puller).
const res = await fetch(`${BASE}/api/payments/solana/subscribe-tx?reference=${ref}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: subscriber.publicKey.toBase58() }),
})
const data = await res.json()
if (!data.transaction) {
  console.error('subscribe-tx did not return a transaction:', JSON.stringify(data))
  process.exit(1)
}

// 2. Deserialize, sign as the subscriber, submit.
const vtx = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'))
vtx.sign([subscriber])
const sig = await conn.sendRawTransaction(vtx.serialize())
console.log('subscribe sent:', sig)
await conn.confirmTransaction(sig, 'confirmed')
console.log('SUBSCRIBED on devnet ✓ — the checkout page should confirm + fire the first pull within ~3s.')
console.log(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`)
