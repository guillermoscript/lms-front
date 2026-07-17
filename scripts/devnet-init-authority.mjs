/**
 * Creates the SubscriptionAuthority for the subscriber+mint in ITS OWN tx
 * (per the Solana subscriptions docs: init authority and subscribe are TWO
 * separate transactions). After this, the app's subscribe-tx route sees the
 * authority exists and builds a subscribe-ONLY tx.
 *
 * Usage:  node scripts/devnet-init-authority.mjs
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import {
  createSolanaRpc, createKeyPairSignerFromBytes, address,
  createTransactionMessage, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstruction,
  signTransactionMessageWithSigners, getBase64EncodedWireTransaction,
} from '@solana/kit'
import {
  findSubscriptionAuthorityPda, getInitSubscriptionAuthorityInstruction,
  fetchMaybeSubscriptionAuthorityFromSeeds,
} from '@solana/subscriptions'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const here = dirname(fileURLToPath(import.meta.url))

const subBytes = Uint8Array.from(JSON.parse(readFileSync(join(here, '.devnet-subscriber.json'), 'utf8')))
const mint = JSON.parse(readFileSync(join(here, '.devnet-mint.json'), 'utf8')).mint

const signer = await createKeyPairSignerFromBytes(subBytes)
console.log('subscriber:', signer.address)
console.log('mint:', mint)

const rpc = createSolanaRpc(RPC)

// Already there?
const maybe = await fetchMaybeSubscriptionAuthorityFromSeeds(rpc, {
  user: signer.address, tokenMint: address(mint),
})
if (maybe.exists) {
  console.log('SubscriptionAuthority already exists ✓ — nothing to do. init_id:', maybe.data.initId)
  process.exit(0)
}

const [subAuthorityPda] = await findSubscriptionAuthorityPda({
  user: signer.address, tokenMint: address(mint),
})
const userAta = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(String(signer.address))).toBase58()

const initIx = getInitSubscriptionAuthorityInstruction({
  owner: signer,
  subscriptionAuthority: subAuthorityPda,
  tokenMint: address(mint),
  userAta: address(userAta),
  tokenProgram: address(SPL_TOKEN),
})

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
let msg = createTransactionMessage({ version: 0 })
msg = setTransactionMessageFeePayer(signer.address, msg)
msg = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg)
msg = appendTransactionMessageInstruction(initIx, msg)
const signed = await signTransactionMessageWithSigners(msg)
const b64 = getBase64EncodedWireTransaction(signed)

const conn = new Connection(RPC, 'confirmed')
const sig = await conn.sendRawTransaction(Buffer.from(b64, 'base64'))
console.log('init-authority sent:', sig)
await conn.confirmTransaction(sig, 'confirmed')
console.log('AUTHORITY CREATED ✓ (separate tx). Now do checkout + run devnet-subscribe.mjs.')
console.log(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`)
