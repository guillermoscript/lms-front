/**
 * Submit + confirm a wallet-SIGNED Solana transaction (issue #280, Phase 6 —
 * in-app desktop wallet checkout).
 *
 * The in-app "Pay with Phantom" flow signs transactions with the browser
 * extension's `signTransaction` (sign-only). It does NOT use
 * `signAndSendTransaction` because Phantom simulates against its own RPC, and
 * the subscribe / init instructions trip that simulation. So the client signs,
 * and this route broadcasts the raw signed tx to our RPC (skip preflight) and
 * waits for confirmation before returning — the caller needs the init tx
 * CONFIRMED before it can request the subscribe tx.
 *
 * The transaction is already signed by the wallet owner, so submitting it is
 * self-authorizing for FUND MOVEMENT — but being wallet-signed does not mean
 * the instructions are ours. Without a check, this route is a generic signed-tx
 * relay: any authenticated user could get an unrelated program's instructions
 * signed by their own wallet and broadcast through our RPC, burning our RPC
 * quota/cost for activity with no connection to a payment on this platform. We
 * require an authenticated session AND restrict every instruction's program id
 * to the small set our own checkout flows ever build (System, SPL Token,
 * Associated Token Account, and the Subscriptions program), so this can only
 * ever relay transactions produced by /solana/tx or /solana/subscribe-tx.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, VersionedTransaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { createClient } from '@/lib/supabase/server'
import { SUBS_PROGRAM_ADDRESS } from '@/lib/payments/solana-subscriptions'
import { paymentAuthLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// A Solana transaction can be at most 1232 bytes on the wire.
const MAX_TX_BYTES = 1232

// The only programs any of our checkout flows ever build instructions for
// (solana-split.ts, solana-subscriptions.ts). Anything else means this isn't
// one of our transactions.
const ALLOWED_PROGRAM_IDS = new Set([
  SystemProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  SUBS_PROGRAM_ADDRESS,
])

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentAuthLimiter.check(10, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { transaction } = await req.json()
    if (!transaction || typeof transaction !== 'string') {
      return NextResponse.json({ error: 'Missing transaction' }, { status: 400 })
    }

    let raw: Buffer
    try {
      raw = Buffer.from(transaction, 'base64')
    } catch {
      return NextResponse.json({ error: 'Invalid transaction encoding' }, { status: 400 })
    }
    if (raw.length < 64 || raw.length > MAX_TX_BYTES) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    let vtx: VersionedTransaction
    try {
      vtx = VersionedTransaction.deserialize(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }
    // A program id must always live in staticAccountKeys — Solana does not
    // allow resolving a program id via an address lookup table — so this
    // covers every instruction regardless of transaction version.
    const { staticAccountKeys, compiledInstructions } = vtx.message
    const programIds = compiledInstructions.map((ix) => staticAccountKeys[ix.programIdIndex]?.toBase58())
    if (programIds.length === 0 || programIds.some((id) => !id || !ALLOWED_PROGRAM_IDS.has(id))) {
      return NextResponse.json({ error: 'Unsupported transaction' }, { status: 400 })
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana not configured' }, { status: 503 })
    }

    const conn = new Connection(rpcUrl, 'confirmed')
    const signature = await conn.sendRawTransaction(raw, {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
      maxRetries: 5,
    })

    // Poll for confirmation (getSignatureStatuses is reliable on devnet, where
    // blockhash-based confirmTransaction can race the validator).
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1500))
      const { value } = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true })
      const st = value[0]
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
        if (st.err) {
          return NextResponse.json(
            { error: 'Transaction failed on-chain', signature, detail: JSON.stringify(st.err) },
            { status: 400 },
          )
        }
        return NextResponse.json({ signature, confirmed: true })
      }
    }

    return NextResponse.json({ error: 'Confirmation timed out', signature }, { status: 504 })
  } catch (error) {
    console.error('[solana/submit] error:', error)
    const message = error instanceof Error ? error.message : 'Submit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
