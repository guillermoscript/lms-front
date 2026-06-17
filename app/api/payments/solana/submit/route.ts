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
 * self-authorizing; this route only relays it. We still require an authenticated
 * session (so it is not an anonymous RPC relay) and bound the payload size.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection } from '@solana/web3.js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// A Solana transaction can be at most 1232 bytes on the wire.
const MAX_TX_BYTES = 1232

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
