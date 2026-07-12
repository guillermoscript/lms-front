/**
 * Solana payment split (issue #280) — platform fee on student payments.
 *
 * Solana Pay TRANSFER requests allow only ONE recipient, so a fee split is done
 * via a Solana Pay TRANSACTION request: our server builds a single transaction
 * with TWO transfer instructions — school share + platform share — that the
 * wallet signs once and the runtime executes atomically.
 *
 * The split percentage comes from `revenue_splits.platform_percentage` (the same
 * model as Stripe Connect's application fee). The school wallet comes from
 * `tenant_payment_wallets`; the platform wallet from env SOLANA_PLATFORM_WALLET.
 *
 * Verification cannot use `@solana/pay`'s validateTransfer (it only checks a
 * single recipient/amount), so we verify BOTH legs ourselves:
 *   findReference → getParsedTransaction → assert school leg + platform leg.
 *
 * Native SOL and SPL (e.g. USDC) are both supported; native SOL is the simplest
 * path (no associated-token-account handling).
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token'
import { findReference, FindReferenceError } from '@solana/pay'

export interface SplitAmounts {
  /** Total in base units (lamports for SOL, token base units for SPL). */
  totalBase: number
  platformBase: number
  schoolBase: number
}

/**
 * Split a major-unit amount into integer base units for two recipients.
 * Platform share is floored; the school receives the remainder so the two legs
 * always sum to exactly the total (no dust lost or created).
 */
export function computeSplit(
  amountMajor: number,
  platformPercent: number,
  decimals: number,
): SplitAmounts {
  const factor = Math.pow(10, decimals)
  return computeSplitFromBase(Math.round(amountMajor * factor), platformPercent)
}

/**
 * Split an already-computed integer base total (lamports or token base units).
 * Used when the amount was LOCKED at checkout (e.g. native SOL converted from a
 * USD price at the live rate) and must NOT be recomputed — the rate has since
 * moved, so re-deriving from the major amount would mismatch what was paid.
 */
export function computeSplitFromBase(
  totalBase: number,
  platformPercent: number,
): SplitAmounts {
  const platformBase = Math.floor((totalBase * platformPercent) / 100)
  const schoolBase = totalBase - platformBase
  return { totalBase, platformBase, schoolBase }
}

/** A fresh on-chain reference key — the correlation marker for this payment. */
export function generateReference(): string {
  return Keypair.generate().publicKey.toBase58()
}

export interface BuildSplitParams {
  connection: Connection
  payer: PublicKey
  schoolWallet: PublicKey
  platformWallet: PublicKey
  /** USD major amount (legacy path; converted via `decimals`). Ignored if `totalBase` set. */
  amountMajor?: number
  /** Pre-locked integer base total (lamports / token base units). Takes precedence. */
  totalBase?: number
  platformPercent: number
  reference: PublicKey
  /** SPL mint; omit for native SOL. */
  splToken?: PublicKey
  /** Token decimals (9 for SOL, 6 for USDC). */
  decimals: number
}

/**
 * Build the split transaction (two transfers, reference on the school leg) and
 * return it base64-serialized for a Solana Pay transaction-request response.
 * The wallet overrides feePayer + blockhash, so the payer covers the network fee.
 */
export async function buildSplitTransaction(params: BuildSplitParams): Promise<string> {
  const { connection, payer, schoolWallet, platformWallet, amountMajor, totalBase, platformPercent, reference, splToken, decimals } = params
  const { platformBase, schoolBase } = totalBase != null
    ? computeSplitFromBase(totalBase, platformPercent)
    : computeSplit(amountMajor!, platformPercent, decimals)

  const tx = new Transaction()

  if (!splToken) {
    // Native SOL: lamports straight to each wallet.
    const schoolIx = SystemProgram.transfer({ fromPubkey: payer, toPubkey: schoolWallet, lamports: schoolBase })
    // Reference attached to the school leg so findReference locates the tx.
    schoolIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false })
    tx.add(schoolIx)
    if (platformBase > 0) {
      tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: platformWallet, lamports: platformBase }))
    }
  } else {
    // SPL: transferChecked between associated token accounts; idempotently
    // create the recipients' ATAs (payer funds the rent if missing).
    const payerAta = getAssociatedTokenAddressSync(splToken, payer)
    const schoolAta = getAssociatedTokenAddressSync(splToken, schoolWallet)
    const platformAta = getAssociatedTokenAddressSync(splToken, platformWallet)
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, schoolAta, schoolWallet, splToken))
    const schoolIx = createTransferCheckedInstruction(payerAta, splToken, schoolAta, payer, schoolBase, decimals)
    schoolIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false })
    tx.add(schoolIx)
    if (platformBase > 0) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, platformAta, platformWallet, splToken))
      tx.add(createTransferCheckedInstruction(payerAta, splToken, platformAta, payer, platformBase, decimals))
    }
  }

  tx.feePayer = payer
  const { blockhash } = await connection.getLatestBlockhash('finalized')
  tx.recentBlockhash = blockhash

  // requireAllSignatures: false — the payer's signature is added by the wallet.
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')
}

export interface VerifySplitParams {
  connection: Connection
  reference: PublicKey
  payer?: PublicKey
  schoolWallet: PublicKey
  platformWallet: PublicKey
  /** USD major amount (legacy path). Ignored if `totalBase` set. */
  amountMajor?: number
  /** Pre-locked integer base total (lamports / token base units). Takes precedence. */
  totalBase?: number
  platformPercent: number
  splToken?: PublicKey
  decimals: number
}

/**
 * Verify a confirmed on-chain transaction carrying `reference` actually paid
 * BOTH the school and the platform their exact shares. Returns
 * { confirmed: false } if no tx is found yet (caller keeps polling); throws if a
 * tx is found but the legs don't match (wrong amount/destination) — that must
 * NOT be treated as a successful payment.
 */
export async function verifySplitTransfer(
  params: VerifySplitParams,
): Promise<{ confirmed: boolean; signature?: string }> {
  const { connection, reference, schoolWallet, platformWallet, amountMajor, totalBase, platformPercent, splToken, decimals } = params
  const { platformBase, schoolBase } = totalBase != null
    ? computeSplitFromBase(totalBase, platformPercent)
    : computeSplit(amountMajor!, platformPercent, decimals)

  let signature: string
  try {
    const sigInfo = await findReference(connection, reference, { finality: 'confirmed' })
    signature = sigInfo.signature
  } catch (err) {
    if (err instanceof FindReferenceError) return { confirmed: false }
    throw new Error(`verifySplitTransfer findReference failed: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  const parsed = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })
  if (!parsed) throw new Error('verifySplitTransfer: transaction not found after findReference')
  if (parsed.meta?.err) throw new Error(`verifySplitTransfer: on-chain transaction failed: ${JSON.stringify(parsed.meta.err)}`)

  // Collect (destination, baseAmount) for every transfer leg in the tx.
  type Leg = { destination: string; amount: number }
  const legs: Leg[] = []
  for (const ix of parsed.transaction.message.instructions as Array<Record<string, unknown>>) {
    const parsedIx = (ix as { parsed?: { type?: string; info?: Record<string, unknown> }; program?: string }).parsed
    if (!parsedIx?.info) continue
    const program = (ix as { program?: string }).program
    if (!splToken && program === 'system' && parsedIx.type === 'transfer') {
      legs.push({ destination: String(parsedIx.info.destination), amount: Number(parsedIx.info.lamports) })
    } else if (splToken && program === 'spl-token' && (parsedIx.type === 'transferChecked' || parsedIx.type === 'transfer')) {
      const amt = parsedIx.type === 'transferChecked'
        ? Number((parsedIx.info.tokenAmount as { amount?: string })?.amount)
        : Number(parsedIx.info.amount)
      legs.push({ destination: String(parsedIx.info.destination), amount: amt })
    }
  }

  // Expected destinations: wallets (native SOL) or their ATAs (SPL).
  const schoolDest = splToken ? getAssociatedTokenAddressSync(splToken, schoolWallet).toBase58() : schoolWallet.toBase58()
  const platformDest = splToken ? getAssociatedTokenAddressSync(splToken, platformWallet).toBase58() : platformWallet.toBase58()

  const schoolOk = legs.some((l) => l.destination === schoolDest && l.amount === schoolBase)
  const platformOk = platformBase === 0 || legs.some((l) => l.destination === platformDest && l.amount === platformBase)

  if (!schoolOk || !platformOk) {
    throw new Error(
      `verifySplitTransfer: leg mismatch (schoolOk=${schoolOk} platformOk=${platformOk}); ` +
        `expected school ${schoolBase}→${schoolDest}, platform ${platformBase}→${platformDest}; legs=${JSON.stringify(legs)}`,
    )
  }

  return { confirmed: true, signature }
}
