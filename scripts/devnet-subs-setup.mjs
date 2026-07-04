/**
 * One-time devnet setup for the native auto-pull subscription flow (solana_subs).
 *
 * Reuses the already-funded payer (scripts/.devnet-payer.json) as the FUNDER so
 * no extra faucet rounds are needed. Idempotent — re-running reuses saved keys.
 * It:
 *   1. creates a 6-decimal SPL "USDC" mint on devnet (authority = funder),
 *   2. creates a puller/merchant keypair + a subscriber keypair (persisted),
 *   3. funds both with a little SOL (rent + fees) from the funder,
 *   4. creates the subscriber's token account + mints 100 test tokens to it,
 *   5. creates the school + platform wallet token accounts (pull receivers).
 *
 * Prints the env values to paste into .env.local:
 *   SOLANA_USDC_MINT, SOLANA_PULLER_SECRET_KEY, and the SUBSCRIBER_PUBKEY.
 *
 * Usage:  node scripts/devnet-subs-setup.mjs
 */

import {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction,
  sendAndConfirmTransaction, PublicKey,
} from '@solana/web3.js'
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { getBase58Decoder } from '@solana/kit'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const SCHOOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'   // tenant solana_subs wallet
const PLATFORM = 'HraM9Wi1GdPkPrAcbFmaTf81EwxMZxTcdovEQg5TmQVo' // SOLANA_PLATFORM_WALLET
const here = dirname(fileURLToPath(import.meta.url))
const p = (f) => join(here, f)

const conn = new Connection(RPC, 'confirmed')

function loadOrCreate(file) {
  const path = p(file)
  if (existsSync(path)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))))
  const k = Keypair.generate()
  writeFileSync(path, JSON.stringify(Array.from(k.secretKey)))
  return k
}

// Funder = the wallet you already funded with the web faucet.
if (!existsSync(p('.devnet-payer.json'))) {
  console.error('scripts/.devnet-payer.json not found — run the one-time pay flow first to create + fund it.')
  process.exit(1)
}
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p('.devnet-payer.json'), 'utf8'))))
const fbal = await conn.getBalance(funder.publicKey)
console.log('funder:', funder.publicKey.toBase58(), '=', fbal / LAMPORTS_PER_SOL, 'SOL')
if (fbal < 0.15 * LAMPORTS_PER_SOL) {
  console.error(`funder needs >= 0.15 SOL. Fund ${funder.publicKey.toBase58()} via https://faucet.solana.com (devnet).`)
  process.exit(1)
}

const puller = loadOrCreate('.devnet-puller.json')
const subscriber = loadOrCreate('.devnet-subscriber.json')
console.log('puller (merchant):', puller.publicKey.toBase58())
console.log('subscriber:', subscriber.publicKey.toBase58())

// Fund puller + subscriber with SOL for rent/fees.
async function fund(to, sol) {
  const need = Math.round(sol * LAMPORTS_PER_SOL)
  const have = await conn.getBalance(to)
  if (have >= need) return
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: to, lamports: need - have }),
  )
  await sendAndConfirmTransaction(conn, tx, [funder])
}
await fund(puller.publicKey, 0.08)
await fund(subscriber.publicKey, 0.08)
console.log('funded puller + subscriber (0.08 SOL each)')

// SPL mint (6 decimals, like USDC), authority = funder. Persisted.
let mint
const mintFile = p('.devnet-mint.json')
if (existsSync(mintFile)) {
  mint = new PublicKey(JSON.parse(readFileSync(mintFile, 'utf8')).mint)
} else {
  mint = await createMint(conn, funder, funder.publicKey, null, 6)
  writeFileSync(mintFile, JSON.stringify({ mint: mint.toBase58() }))
}
console.log('mint:', mint.toBase58())

// Subscriber token account + 100 test tokens.
const subAta = await getOrCreateAssociatedTokenAccount(conn, funder, mint, subscriber.publicKey)
await mintTo(conn, funder, mint, subAta.address, funder, 100_000_000) // 100.000000
console.log('minted 100 tokens to subscriber ATA:', subAta.address.toBase58())

// School + platform token accounts (the pull transfers into these — must exist).
const schoolAta = await getOrCreateAssociatedTokenAccount(conn, funder, mint, new PublicKey(SCHOOL))
const platformAta = await getOrCreateAssociatedTokenAccount(conn, funder, mint, new PublicKey(PLATFORM))
console.log('school ATA:', schoolAta.address.toBase58())
console.log('platform ATA:', platformAta.address.toBase58())

const pullerSecB58 = getBase58Decoder().decode(puller.secretKey)

// Append the env vars to .env.local directly (so no secret needs copying).
const envPath = join(here, '..', '.env.local')
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const upsert = (key, val) => {
  const line = `${key}=${val}`
  if (env.includes(`\n${key}=`) || env.startsWith(`${key}=`)) {
    env = env.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  } else {
    env += (env.endsWith('\n') || env === '' ? '' : '\n') + line + '\n'
  }
}
upsert('SOLANA_USDC_MINT', mint.toBase58())
upsert('SOLANA_PULLER_SECRET_KEY', pullerSecB58)
writeFileSync(envPath, env)

console.log('\n================ wrote to .env.local ================')
console.log('SOLANA_USDC_MINT=' + mint.toBase58())
console.log('SOLANA_PULLER_SECRET_KEY=<written to .env.local>')
console.log('SUBSCRIBER_PUBKEY=' + subscriber.publicKey.toBase58())
console.log('=====================================================')
console.log('Setup complete ✓ — tell Claude to restart the dev server.')
