/**
 * Fund an arbitrary devnet wallet for the real-wallet subscription test:
 *   - transfers a little SOL (fees + account rent) from the funder, and
 *   - creates the wallet's token account + mints test "USDC" tokens to it.
 *
 * Avoids the public faucet (rate-limited) by using the already-funded funder
 * keypair (scripts/.devnet-payer.json) and the test mint's authority.
 *
 * Usage:  node scripts/devnet-fund-wallet.mjs <wallet_address> [tokens] [sol]
 *   tokens default 5, sol default 0.05
 */

import {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction,
  sendAndConfirmTransaction, PublicKey,
} from '@solana/web3.js'
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const here = dirname(fileURLToPath(import.meta.url))
const p = (f) => join(here, f)

const dest = process.argv[2]
const tokens = Number(process.argv[3] || '5')
const sol = Number(process.argv[4] || '0.05')
if (!dest) { console.error('usage: node scripts/devnet-fund-wallet.mjs <wallet_address> [tokens] [sol]'); process.exit(1) }

let destPk
try { destPk = new PublicKey(dest) } catch { console.error('invalid wallet address:', dest); process.exit(1) }

if (!existsSync(p('.devnet-payer.json'))) { console.error('scripts/.devnet-payer.json not found'); process.exit(1) }
if (!existsSync(p('.devnet-mint.json'))) { console.error('scripts/.devnet-mint.json not found — run devnet-subs-setup.mjs first'); process.exit(1) }

const conn = new Connection(RPC, 'confirmed')
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p('.devnet-payer.json'), 'utf8'))))
const mint = new PublicKey(JSON.parse(readFileSync(p('.devnet-mint.json'), 'utf8')).mint)

console.log('funder:', funder.publicKey.toBase58())
console.log('mint  :', mint.toBase58())
console.log('dest  :', destPk.toBase58())

// 1. SOL for fees + rent.
const need = Math.round(sol * LAMPORTS_PER_SOL)
const have = await conn.getBalance(destPk)
if (have < need) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: destPk, lamports: need - have }),
  )
  const sig = await sendAndConfirmTransaction(conn, tx, [funder])
  console.log(`sent ${(need - have) / LAMPORTS_PER_SOL} SOL ✓ (${sig})`)
} else {
  console.log('already has >= requested SOL, skipping transfer')
}

// 2. Token account + mint test tokens (6 decimals).
const ata = await getOrCreateAssociatedTokenAccount(conn, funder, mint, destPk)
await mintTo(conn, funder, mint, ata.address, funder, Math.round(tokens * 1_000_000))
const bal = await conn.getTokenAccountBalance(ata.address)
console.log(`token ATA: ${ata.address.toBase58()}`)
console.log(`minted ${tokens} tokens ✓ — balance now ${bal.value.uiAmountString}`)
console.log('\nWallet funded ✓ — open the desktop test page and subscribe.')
