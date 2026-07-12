/**
 * Live devnet test for the Solana Pay adapter (issue #280 Phase 5).
 *
 * 1. Build a Solana Pay transfer-request URL via SolanaProvider.createCheckoutSession.
 * 2. Airdrop devnet SOL to a fresh payer.
 * 3. Send the transfer to the recipient WITH the on-chain reference attached.
 * 4. Call provider.confirmTransfer(reference, amount) → expect { confirmed: true }.
 * 5. Negative check: confirmTransfer on a random reference → { confirmed: false }.
 *
 * Run: npx tsx scripts/test-solana-devnet.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { parseURL } from '@solana/pay'
import BigNumber from 'bignumber.js'
import { SolanaProvider } from '../lib/payments/solana-provider'

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet')

async function airdrop(connection: Connection, pubkey: PublicKey, sol: number) {
  for (let i = 0; i < 3; i++) {
    try {
      const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL)
      await connection.confirmTransaction(sig, 'confirmed')
      return
    } catch (e) {
      console.log(`  airdrop attempt ${i + 1} failed, retrying…`, (e as Error).message)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw new Error('airdrop failed after retries')
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const recipient = Keypair.generate() // merchant wallet (we only need its pubkey)
  const payer = Keypair.generate()

  console.log('RPC:', RPC)
  console.log('recipient:', recipient.publicKey.toBase58())

  // SOL native payment (no SPL mint) — amount in decimal SOL.
  const AMOUNT = 0.01
  const provider = new SolanaProvider(RPC, recipient.publicKey.toBase58())

  // 1. Build the checkout (generates the reference internally).
  const session = await provider.createCheckoutSession({
    mode: 'one_time',
    providerPriceId: '',
    amount: AMOUNT,
    currency: 'usdt',
    reference: '12345', // our internal tx id (correlation)
    metadata: { label: 'Test', message: 'Devnet test order' },
  })
  console.log('\n1. checkout session:', { kind: session.kind, providerRef: session.providerRef })
  console.log('   url:', session.url)
  if (session.kind !== 'qr' || !session.providerRef) throw new Error('expected qr + providerRef')

  const referencePubkey = new PublicKey(session.providerRef)
  // Sanity: the encoded URL parses and carries our reference + recipient + amount.
  const parsed = parseURL(session.url!) as {
    recipient: PublicKey
    amount?: BigNumber
    reference?: PublicKey | PublicKey[]
  }
  console.log('   parsed recipient match:', parsed.recipient.equals(recipient.publicKey))
  console.log('   parsed amount:', parsed.amount?.toString())

  // 2. Fund the payer.
  console.log('\n2. airdropping devnet SOL to payer…')
  await airdrop(connection, payer.publicKey, 1)

  // 3. Send the transfer WITH the reference as a read-only, non-signer key
  //    (this is what makes the tx discoverable by findReference).
  console.log('3. sending transfer with reference attached…')
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: new BigNumber(AMOUNT).multipliedBy(LAMPORTS_PER_SOL).integerValue().toNumber(),
    }),
  )
  tx.instructions[0].keys.push({ pubkey: referencePubkey, isSigner: false, isWritable: false })
  const sentSig = await sendAndConfirmTransaction(connection, tx, [payer])
  console.log('   sent signature:', sentSig)

  // 4. Confirm via the provider (findReference + validateTransfer).
  console.log('\n4. confirmTransfer (matching reference + amount)…')
  let confirmed = { confirmed: false } as { confirmed: boolean; signature?: string }
  for (let i = 0; i < 10; i++) {
    confirmed = await provider.confirmTransfer(session.providerRef, AMOUNT)
    if (confirmed.confirmed) break
    await new Promise((r) => setTimeout(r, 1500))
  }
  console.log('   →', confirmed)
  if (!confirmed.confirmed) throw new Error('FAIL: transfer not confirmed')

  // 5. Negative: a random reference must NOT confirm.
  console.log('\n5. negative check (random reference)…')
  const negative = await provider.confirmTransfer(Keypair.generate().publicKey.toBase58(), AMOUNT)
  console.log('   →', negative)
  if (negative.confirmed) throw new Error('FAIL: random reference should not confirm')

  console.log('\n✅ Solana devnet adapter test PASSED')
}

main().catch((e) => {
  console.error('\n❌ TEST FAILED:', e)
  process.exit(1)
})
