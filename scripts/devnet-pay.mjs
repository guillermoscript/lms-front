/**
 * Devnet payer for the Solana Pay split checkout (issue #280 settlement test).
 *
 * Mimics exactly what a Solana Pay wallet does, but on devnet and run by YOU:
 *   1. load (or create) a PERSISTENT throwaway payer keypair, ensure it has SOL,
 *   2. POST the app's /api/payments/solana/tx?reference=<txId> to get the
 *      server-built split transaction (school leg + platform fee),
 *   3. sign it with the payer and send it to devnet.
 *
 * The browser checkout page (kept open, polling /verify) then confirms the
 * on-chain transfer and flips the order to successful → enrollment.
 *
 * The payer key is saved to scripts/.devnet-payer.json so you can fund it ONCE
 * (the public devnet faucet often blocks the RPC airdrop) and re-run.
 *
 * Usage:  node scripts/devnet-pay.mjs <transaction_id>
 * Env:    BASE_URL (default http://code-academy.lvh.me:3005)
 *         SOLANA_RPC_URL (default https://api.devnet.solana.com)
 */

import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://code-academy.lvh.me:3005'
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const txId = process.argv[2]
if (!txId) {
  console.error('usage: node scripts/devnet-pay.mjs <transaction_id>')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const keyPath = join(here, '.devnet-payer.json')

// 1. Persistent payer — created once, reused across runs so you can fund it.
let payer
if (existsSync(keyPath)) {
  payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))))
  console.log('payer (saved):', payer.publicKey.toBase58())
} else {
  payer = Keypair.generate()
  writeFileSync(keyPath, JSON.stringify(Array.from(payer.secretKey)))
  console.log('payer (new, saved to scripts/.devnet-payer.json):', payer.publicKey.toBase58())
}

const conn = new Connection(RPC, 'confirmed')
const NEED = 0.2 * LAMPORTS_PER_SOL // order is $0.10 → 0.1 SOL, + fees + rent headroom

let bal = await conn.getBalance(payer.publicKey)
console.log('payer balance:', bal / LAMPORTS_PER_SOL, 'SOL')

// 2. Fund if low: try the RPC airdrop, fall back to manual faucet instructions.
if (bal < NEED) {
  console.log('balance low — trying a 1 SOL devnet airdrop…')
  try {
    const sig = await conn.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL)
    await conn.confirmTransaction(sig, 'confirmed')
    bal = await conn.getBalance(payer.publicKey)
    console.log('airdrop ok, balance:', bal / LAMPORTS_PER_SOL, 'SOL')
  } catch (e) {
    console.error('RPC airdrop unavailable:', e.message)
  }
}

if (bal < NEED) {
  console.error('\nNeed ~0.2 devnet SOL. Fund this address, then re-run the SAME command:')
  console.error('  ' + payer.publicKey.toBase58())
  console.error('Faucets: https://faucet.solana.com  (set cluster to devnet)')
  console.error('     or: solana airdrop 1 ' + payer.publicKey.toBase58() + ' --url devnet')
  process.exit(1)
}

// 3. Ask the app to build the split transaction (what the wallet would fetch).
const res = await fetch(`${BASE}/api/payments/solana/tx?reference=${txId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: payer.publicKey.toBase58() }),
})
const data = await res.json()
if (!data.transaction) {
  console.error('tx endpoint did not return a transaction:', JSON.stringify(data))
  process.exit(1)
}
const tx = Transaction.from(Buffer.from(data.transaction, 'base64'))

// 4. Sign with the payer (the only required signer) and send.
tx.partialSign(payer)
const sig = await conn.sendRawTransaction(tx.serialize())
console.log('sent:', sig)
await conn.confirmTransaction(sig, 'confirmed')
console.log('CONFIRMED on devnet ✓ — the checkout page should flip to success within ~3s.')
console.log(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`)
