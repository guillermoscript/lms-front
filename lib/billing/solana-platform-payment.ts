/**
 * Solana as a school → platform rail (issue #610).
 *
 * The student loop splits every payment two ways — the school's wallet and the
 * platform's fee wallet, atomically, from `revenue_splits`. Platform billing has
 * no such split to make: the platform IS the payee, so there is exactly one
 * recipient, `SOLANA_PLATFORM_WALLET`.
 *
 * That is expressed as `platformPercent: 0` against the existing split builder
 * with both wallets set to the platform's own, rather than as a second
 * transaction builder. The zero-value leg is skipped by `buildSplitTransaction`,
 * so what lands on chain is a single transfer carrying our reference — and the
 * verifier that already knows how to read those legs keeps working unchanged.
 * A parallel implementation would be a second place for the SPL/native branch,
 * the ATA handling and the leg-matching rules to drift.
 *
 * The pending intent lives in `platform_payment_requests`: a crypto payment is
 * an out-of-band settlement with its own amount snapshot and TTL, exactly like
 * a bank wire. The only difference is who confirms it — the chain rather than a
 * super admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Connection, PublicKey } from '@solana/web3.js'
import { buildSplitTransaction, verifySplitTransfer } from '@/lib/payments/solana-split'
import { getSolUsdPrice, usdToLamports } from '@/lib/payments/sol-price'
import { classifyPlanChange } from '@/lib/billing/plan-change'
import { requestExpiresAt } from '@/lib/billing/payment-request-ttl'

/** Decimals of the token a platform payment settles in. */
const USDC_DECIMALS = 6
const SOL_DECIMALS = 9

export interface PlatformSolanaConfig {
  rpcUrl: string
  /** The single recipient of a platform-billing payment. */
  platformWallet: PublicKey
  /** SPL mint when settling in USDC; undefined for native SOL. */
  usdcMint?: PublicKey
}

/**
 * Read the platform's Solana configuration, or `null` when it is incomplete.
 *
 * Returning null rather than throwing keeps "the platform has not set this up"
 * a 503 the school can be told about, distinct from a payment that failed.
 */
export function getPlatformSolanaConfig(): PlatformSolanaConfig | null {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const wallet = process.env.SOLANA_PLATFORM_WALLET
  if (!rpcUrl || !wallet) return null
  try {
    const usdcMint = process.env.SOLANA_USDC_MINT
    return {
      rpcUrl,
      platformWallet: new PublicKey(wallet),
      usdcMint: usdcMint ? new PublicKey(usdcMint) : undefined,
    }
  } catch {
    console.error('[billing/solana] SOLANA_PLATFORM_WALLET or SOLANA_USDC_MINT is not a valid pubkey')
    return null
  }
}

export interface PlatformSettlement {
  /** 'usdc' | 'sol' — what the school actually transfers. */
  currency: 'usdc' | 'sol'
  /** Integer base units (USDC micro / lamports), LOCKED at checkout. */
  base: number
  /** SPL mint for USDC; null for native SOL. */
  mint: string | null
  /** The SOL/USD quote this lock was computed at; null for USDC. */
  solUsd: number | null
}

/**
 * Convert a USD plan price into the on-chain amount to charge, locking it.
 *
 * USDC is a 1:1 USD stablecoin, so the lock is pure arithmetic. Native SOL
 * needs the live rate, and the figure it produces must be stored: verification
 * compares against the LOCKED amount, never a fresh quote, because the rate has
 * moved by the time the school's transfer confirms and re-deriving it would
 * read a correct payment as the wrong amount.
 */
export async function quotePlatformSettlement(
  amountUsd: number,
  config: PlatformSolanaConfig,
): Promise<PlatformSettlement> {
  if (config.usdcMint) {
    return {
      currency: 'usdc',
      base: Math.round(amountUsd * 10 ** USDC_DECIMALS),
      mint: config.usdcMint.toBase58(),
      solUsd: null,
    }
  }
  const rate = await getSolUsdPrice()
  return { currency: 'sol', base: usdToLamports(amountUsd, rate), mint: null, solUsd: rate }
}

/** The stored settlement of a pending request, as the DB holds it. */
export interface StoredSettlement {
  settlement_currency: string | null
  settlement_base: number | string | null
  settlement_mint: string | null
}

interface ResolvedSettlement {
  totalBase: number
  splToken?: PublicKey
  decimals: number
}

/**
 * Read a stored settlement back into the shape the builder/verifier take, or
 * `null` when the row carries no lock. A request with no lock must not be
 * settled: there is no agreed amount to check the transfer against, and
 * inventing one at this point would accept whatever the school sent.
 */
export function resolveStoredSettlement(row: StoredSettlement): ResolvedSettlement | null {
  if (row.settlement_base == null || !row.settlement_currency) return null
  const totalBase = Number(row.settlement_base)
  if (!Number.isFinite(totalBase) || totalBase <= 0) return null
  return {
    totalBase,
    splToken: row.settlement_mint ? new PublicKey(row.settlement_mint) : undefined,
    decimals: row.settlement_currency === 'usdc' ? USDC_DECIMALS : SOL_DECIMALS,
  }
}

/**
 * Build the unsigned transfer the school's wallet signs: the full amount to the
 * platform wallet, with `reference` attached so it can be found again.
 */
export async function buildPlatformTransfer(params: {
  config: PlatformSolanaConfig
  payer: PublicKey
  reference: PublicKey
  settlement: ResolvedSettlement
}): Promise<string> {
  const { config, payer, reference, settlement } = params
  return buildSplitTransaction({
    connection: new Connection(config.rpcUrl, 'confirmed'),
    payer,
    // One recipient: the platform is both legs' owner, and a 0% "platform" leg
    // is skipped, so this serializes to a single transfer.
    schoolWallet: config.platformWallet,
    platformWallet: config.platformWallet,
    platformPercent: 0,
    totalBase: settlement.totalBase,
    reference,
    splToken: settlement.splToken,
    decimals: settlement.decimals,
  })
}

/**
 * Confirm on chain that the locked amount reached the platform wallet carrying
 * this reference.
 *
 * `{ confirmed: false }` means "not on chain yet" — keep polling. A THROW means
 * a transaction was found and it did not pay what was owed; that must never be
 * treated as a payment.
 */
export async function verifyPlatformTransfer(params: {
  config: PlatformSolanaConfig
  reference: PublicKey
  settlement: ResolvedSettlement
}): Promise<{ confirmed: boolean; signature?: string }> {
  const { config, reference, settlement } = params
  return verifySplitTransfer({
    connection: new Connection(config.rpcUrl, 'confirmed'),
    reference,
    schoolWallet: config.platformWallet,
    platformWallet: config.platformWallet,
    platformPercent: 0,
    totalBase: settlement.totalBase,
    splToken: settlement.splToken,
    decimals: settlement.decimals,
  })
}

export interface RecordRequestParams {
  admin: SupabaseClient
  tenantId: string
  /** The admin starting the checkout. */
  userId: string
  planId: string
  /** The plan's price for this interval, in USD — what the school owes. */
  amountUsd: number
  interval: 'monthly' | 'yearly'
  /** The on-chain reference the QR carries, from the provider's session. */
  reference: string
  settlement: PlatformSettlement
  /** Correlates a cross-provider replacement without touching source entitlement. */
  switchId?: string | null
  expiresAt?: string
}

/**
 * Record the pending intent a Solana QR will settle.
 *
 * `request_type` is classified rather than hardcoded, exactly as
 * `requestManualPlanUpgrade` does it: the super-admin queue and the expiry
 * cron's renewal pause both read that column, and an "upgrade" label on a
 * renewal makes both of them wrong.
 */
export async function recordSolanaPlatformRequest(
  params: RecordRequestParams,
): Promise<{ requestId: string }> {
  const {
    admin,
    tenantId,
    userId,
    planId,
    amountUsd,
    interval,
    reference,
    settlement,
    switchId,
    expiresAt,
  } = params

  const [{ data: target }, { data: tenant }] = await Promise.all([
    admin.from('platform_plans').select('sort_order').eq('plan_id', planId).maybeSingle(),
    admin.from('tenants').select('plan').eq('id', tenantId).maybeSingle(),
  ])
  const { data: current } = await admin
    .from('platform_plans')
    .select('sort_order, price_monthly, price_yearly')
    .eq('slug', tenant?.plan || 'free')
    .maybeSingle()

  const currentAmount = current
    ? interval === 'yearly'
      ? current.price_yearly
      : current.price_monthly
    : 0
  const { requestType } = classifyPlanChange({
    currentSortOrder: current?.sort_order ?? 0,
    currentAmount: Number(currentAmount) || 0,
    targetSortOrder: target?.sort_order ?? 0,
    targetAmount: amountUsd,
  })

  const { data, error } = await admin
    .from('platform_payment_requests')
    .insert({
      tenant_id: tenantId,
      plan_id: planId,
      requested_by: userId,
      interval,
      // The USD figure of record. `settlement_base` below is what the chain is
      // checked against; this is what the invoice, the super-admin queue and
      // the revenue screens read, and the two must not be conflated.
      amount: amountUsd,
      currency: 'usd',
      status: 'pending',
      request_type: requestType,
      payment_provider: 'solana',
      provider_reference: reference,
      settlement_currency: settlement.currency,
      settlement_base: settlement.base,
      settlement_mint: settlement.mint,
      settlement_sol_usd: settlement.solUsd,
      expires_at: expiresAt ?? requestExpiresAt(),
      switch_id: switchId ?? null,
    })
    .select('request_id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to record Solana platform payment request: ${error?.message}`)
  }
  return { requestId: data.request_id as string }
}

/**
 * Human-readable amount for the QR page ("12.50 USDC" / "0.0731 SOL"), derived
 * from the same locked figure the chain is checked against so the school is
 * never shown a number it is not about to pay.
 */
export function formatSettlement(row: StoredSettlement): string | null {
  const resolved = resolveStoredSettlement(row)
  if (!resolved) return null
  const major = resolved.totalBase / 10 ** resolved.decimals
  return row.settlement_currency === 'usdc'
    ? `${major.toFixed(2)} USDC`
    : `${major.toFixed(4)} SOL`
}
