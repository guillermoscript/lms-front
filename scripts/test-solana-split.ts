/**
 * Test the Solana fee-split (issue #280).
 *
 * Always runs (no funding needed):
 *   1. computeSplit — exact integer split, legs sum to total, rounding.
 *   2. buildSplitTransaction — decode the built tx: two SystemProgram transfers
 *      to school + platform with the split lamports, reference on the school leg.
 *
 * Full on-chain round-trip (needs devnet SOL — skipped if the faucet is dry):
 *   3. fund payer → sign+submit the built tx → verifySplitTransfer confirms both
 *      legs → a tampered expectation is rejected.
 *
 * Run: npx tsx scripts/test-solana-split.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SystemInstruction,
  Transaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js'
import { computeSplit, buildSplitTransaction, verifySplitTransfer } from '../lib/payments/solana-split'

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet')

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log('  ✓', msg)
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const payer = Keypair.generate()
  const school = Keypair.generate().publicKey
  const platform = Keypair.generate().publicKey
  const reference = Keypair.generate().publicKey
  const AMOUNT = 0.1 // SOL
  const PCT = 20

  // 1. computeSplit
  console.log('\n1. computeSplit')
  const s = computeSplit(AMOUNT, PCT, 9)
  assert(s.totalBase === Math.round(AMOUNT * LAMPORTS_PER_SOL), `total = ${s.totalBase} lamports`)
  assert(s.platformBase === Math.floor(s.totalBase * PCT / 100), `platform = ${s.platformBase} (20%)`)
  assert(s.schoolBase + s.platformBase === s.totalBase, 'legs sum to total (no dust)')
  // rounding edge: odd total
  const odd = computeSplit(0.000000001 * 3, PCT, 9) // 3 lamports
  assert(odd.platformBase + odd.schoolBase === odd.totalBase, 'odd split still sums exactly')

  // 2. buildSplitTransaction (native SOL) — decode + inspect
  console.log('\n2. buildSplitTransaction structure')
  const b64 = await buildSplitTransaction({
    connection, payer: payer.publicKey, schoolWallet: school, platformWallet: platform,
    amountMajor: AMOUNT, platformPercent: PCT, reference, decimals: 9,
  })
  const tx = Transaction.from(Buffer.from(b64, 'base64'))
  const transfers = tx.instructions.filter(ix => ix.programId.equals(SystemProgram.programId))
  assert(transfers.length === 2, `two transfer instructions (got ${transfers.length})`)
  const decoded = transfers.map(ix => SystemInstruction.decodeTransfer(ix))
  const schoolLeg = decoded.find(d => d.toPubkey.equals(school))
  const platformLeg = decoded.find(d => d.toPubkey.equals(platform))
  assert(schoolLeg && Number(schoolLeg.lamports) === s.schoolBase, 'school leg amount correct')
  assert(platformLeg && Number(platformLeg.lamports) === s.platformBase, 'platform leg amount correct')
  // reference must be attached to the school leg
  const schoolIx = transfers.find(ix => SystemInstruction.decodeTransfer(ix).toPubkey.equals(school))!
  assert(schoolIx.keys.some(k => k.pubkey.equals(reference)), 'reference attached to school leg')
  assert(tx.feePayer?.equals(payer.publicKey), 'fee payer = payer')

  // 3. On-chain round-trip (best-effort; needs devnet SOL)
  console.log('\n3. on-chain round-trip (needs devnet SOL)')
  let funded = false
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig, 'confirmed')
    funded = true
  } catch (e) {
    console.log('  ⚠ SKIPPED on-chain leg — faucet unavailable:', String(e).slice(0, 90))
  }

  if (funded) {
    // Rebuild with a fresh blockhash, sign as payer, submit.
    const sendTx = Transaction.from(Buffer.from(
      await buildSplitTransaction({
        connection, payer: payer.publicKey, schoolWallet: school, platformWallet: platform,
        amountMajor: AMOUNT, platformPercent: PCT, reference, decimals: 9,
      }), 'base64'))
    sendTx.feePayer = payer.publicKey
    sendTx.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash
    sendTx.sign(payer)
    const sig = await connection.sendRawTransaction(sendTx.serialize())
    await connection.confirmTransaction(sig, 'confirmed')
    console.log('  sent split tx:', sig)

    // verifySplitTransfer confirms BOTH legs.
    let res = { confirmed: false } as { confirmed: boolean; signature?: string }
    for (let i = 0; i < 10 && !res.confirmed; i++) {
      res = await verifySplitTransfer({
        connection, reference, schoolWallet: school, platformWallet: platform,
        amountMajor: AMOUNT, platformPercent: PCT, decimals: 9,
      })
      if (!res.confirmed) await new Promise(r => setTimeout(r, 1500))
    }
    assert(res.confirmed, 'verifySplitTransfer confirmed both legs')

    // Negative: wrong expected amount must be rejected (throws).
    let rejected = false
    try {
      await verifySplitTransfer({
        connection, reference, schoolWallet: school, platformWallet: platform,
        amountMajor: AMOUNT * 2, platformPercent: PCT, decimals: 9,
      })
    } catch { rejected = true }
    assert(rejected, 'mismatched amount rejected (throws)')
  }

  console.log('\n✅ Solana split test PASSED' + (funded ? ' (incl. on-chain)' : ' (structure only — faucet skipped)'))
}

main().catch(e => { console.error('\n❌ TEST FAILED:', e); process.exit(1) })
