import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscriptionState } from './solana-subscriptions'
import { pullSplitForSubscription } from './solana-subscription-pull'
import { computeSplit } from './solana-split'
import { getEffectiveRevenueSplit } from '@/lib/billing/effective-fee'
import { decidePullAction } from './solana-pull-decision'

export interface SolanaRenewalRow {
  subscription_id: number
  start_date: string
  tenant_id: string
  plan_id: number | null
  subscription_status: string | null
  cancel_at_period_end: boolean | null
  cancel_at: string | null
  provider_subscription_id: string | null
  provider_metadata: unknown
  plans: unknown
}
interface SubscriptionCoordinates {
  subscriber: string
  merchant: string
  planId: string
  mint: string
}
export type SolanaRenewalResult =
  | { status: 'paid'; signatures: string[]; periodEnd: string; reconciled?: boolean }
  | { status: 'insufficient_funds'; amount: number; balance: string }
  | { status: 'not_due' | 'canceled' | 'expired' | 'unconfirmed' }

/** Shared by the cron and the student's authenticated retry. No client amounts. */
export async function renewSolanaSubscription(
  admin: ReturnType<typeof createAdminClient>, sub: SolanaRenewalRow,
  options: { recoveryOnly?: boolean } = {},
): Promise<SolanaRenewalResult> {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  if (!rpcUrl || !pullerSecret || !platformWallet) throw new Error('Solana subscriptions not configured')
  const meta = sub.provider_metadata as SubscriptionCoordinates | null
  if (!meta?.subscriber || !meta.merchant || !meta.planId || !meta.mint) throw new Error('Missing subscription coordinates')
  if (String(sub.plan_id) !== meta.planId) throw new Error('Subscription plan mismatch')
  const state = await getSubscriptionState({ rpcUrl, ...meta, planId: BigInt(meta.planId) })
  if (!state) throw new Error('On-chain subscription not found')
  // Reconcile the paid chain period BEFORE considering a new debit or the DB
  // cancellation gate. A canceled row may still have a missing paid receipt.
  const repaired = await reconcileConfirmedRenewal(admin, sub, meta, state, rpcUrl)
  if (repaired) return repaired
  if (options.recoveryOnly) return { status: 'not_due' }
  const decision = decidePullAction({
    row: { subscription_status: sub.subscription_status ?? '', cancel_at_period_end: sub.cancel_at_period_end, cancel_at: sub.cancel_at },
    state, nowSec: Math.floor(Date.now() / 1000),
  })
  if (decision.action === 'skip') return { status: sub.cancel_at_period_end || state.expiresAtTs !== BigInt(0) ? 'canceled' : 'not_due' }
  if (decision.action === 'expire' || decision.action === 'cancel') {
    const { data: expired, error } = await admin.rpc('expire_subscription_if_due', {
      _subscription_id: sub.subscription_id, _allow_unscheduled: true,
    })
    if (error) throw error
    return { status: expired ? 'expired' : 'not_due' }
  }
  // A cancel arriving after the queue was read must still stop the charge.
  const { data: fresh, error: freshError } = await admin.from('subscriptions')
    .select('subscription_status, cancel_at_period_end').eq('subscription_id', sub.subscription_id).single()
  if (freshError) throw freshError
  if (!['active', 'past_due'].includes(fresh.subscription_status) || fresh.cancel_at_period_end) return { status: 'canceled' }
  const price = Number((sub.plans as { price?: number } | null)?.price)
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid subscription price')
  const periodSeconds = Number(state.periodHours) * 3600
  const nowSec = Math.floor(Date.now() / 1000)
  const periodStart = Number(state.currentPeriodStartTs) + Math.floor((nowSec - Number(state.currentPeriodStartTs)) / periodSeconds) * periodSeconds
  const periodStartIso = new Date(periodStart * 1000).toISOString()
  const periodEndIso = new Date((periodStart + periodSeconds) * 1000).toISOString()
  const network = /devnet/i.test(rpcUrl) ? 'devnet' : /testnet/i.test(rpcUrl) ? 'testnet' : 'mainnet-beta'
  const conn = new Connection(rpcUrl, 'confirmed')
  const ata = getAssociatedTokenAddressSync(new PublicKey(meta.mint), new PublicKey(meta.subscriber))
  const balance = await conn.getTokenAccountBalance(ata)
  const required = BigInt(Math.round(price * 1_000_000))
  if (BigInt(balance.value.amount) < required) {
    const { error } = await admin.rpc('record_solana_renewal', {
      _subscription_id: sub.subscription_id, _period_start: periodStartIso,
      _period_end: periodEndIso, _amount: price, _successful: false,
      _error_code: 'insufficient_funds', _network: network,
    })
    if (error) throw error
    return { status: 'insufficient_funds', amount: price, balance: balance.value.uiAmountString ?? '0' }
  }
  const [{ data: wallet, error: walletError }, effSplit] = await Promise.all([
    admin.from('tenant_payment_wallets').select('wallet_address').eq('tenant_id', sub.tenant_id).eq('provider', 'solana_subs').maybeSingle(),
    getEffectiveRevenueSplit(admin, sub.tenant_id),
  ])
  if (walletError) throw walletError
  if (!wallet?.wallet_address) throw new Error('School receiving wallet missing')
  // Persist uncertainty before submitting. If this write fails, do not debit.
  const { data: attemptAllowed, error: attemptError } = await admin.rpc('begin_solana_renewal', {
    _subscription_id: sub.subscription_id, _period_start: periodStartIso,
  })
  if (attemptError) throw attemptError
  if (attemptAllowed === false) return { status: 'canceled' }
  // Re-read chain after DB/wallet work. Cancellation is authoritative on-chain;
  // the program's deadline and per-period cap also guard transactions in flight.
  const latestState = await getSubscriptionState({ rpcUrl, ...meta, planId: BigInt(meta.planId) })
  if (!latestState || latestState.expiresAtTs !== BigInt(0)) return { status: 'canceled' }
  const signatures = await pullSplitForSubscription({
    rpcUrl, pullerSecretKeyBase58: pullerSecret, ...meta, planId: BigInt(meta.planId),
    schoolWallet: wallet.wallet_address, platformWallet, priceMajor: price,
    platformPercent: effSplit.platformPercentage,
  })
  // Only confirmed atomic transfers reach this point. A timeout/network error
  // propagates without manufacturing a failed or successful receipt.
  const confirmedState = await getSubscriptionState({ rpcUrl, ...meta, planId: BigInt(meta.planId) })
  if (!confirmedState || confirmedState.amountPulledInPeriod !== required) throw new Error('Renewal payment not fully confirmed')
  const confirmedStart = new Date(Number(confirmedState.currentPeriodStartTs) * 1000).toISOString()
  const confirmedEnd = new Date(Number(confirmedState.currentPeriodStartTs + confirmedState.periodHours * BigInt(3600)) * 1000).toISOString()
  const { error: recordError } = await admin.rpc('record_solana_renewal', {
    _subscription_id: sub.subscription_id, _period_start: confirmedStart,
    _period_end: confirmedEnd, _amount: price, _successful: true,
    _signatures: signatures, _network: network,
  })
  if (recordError) throw recordError
  return { status: 'paid', signatures, periodEnd: confirmedEnd }
}

/** Repair a transfer that confirmed before its DB receipt could be committed.
 * Historical two-transaction splits are accepted only after verifying BOTH
 * destinations and the exact total against confirmed token balance changes.
 */
async function reconcileConfirmedRenewal(
  admin: ReturnType<typeof createAdminClient>, sub: SolanaRenewalRow,
  meta: SubscriptionCoordinates,
  state: NonNullable<Awaited<ReturnType<typeof getSubscriptionState>>>, rpcUrl: string,
): Promise<Extract<SolanaRenewalResult, { status: 'paid' }> | null> {
  const price = Number((sub.plans as { price?: number } | null)?.price)
  if (!Number.isFinite(price) || price <= 0) return null
  const total = BigInt(Math.round(price * 1_000_000))
  const periodStart = Number(state.currentPeriodStartTs)
  if (periodStart <= Date.parse(sub.start_date) / 1000 || state.amountPulledInPeriod !== total) return null
  const { data: receipts, error: receiptError } = await admin.from('transactions')
    .select('provider_metadata').eq('provider_subscription_id', sub.provider_subscription_id)
    .eq('payment_provider', 'solana_subs').eq('status', 'successful')
    .eq('provider_metadata->>kind', 'renewal').order('transaction_date', { ascending: false }).limit(1)
  if (receiptError) throw receiptError
  if (receipts?.some((r) => Date.parse(r.provider_metadata?.period_start ?? '') / 1000 === periodStart && r.provider_metadata?.confirmed_at)) return null
  const [{ data: wallet, error: walletError }, effSplit] = await Promise.all([
    admin.from('tenant_payment_wallets').select('wallet_address').eq('tenant_id', sub.tenant_id).eq('provider', 'solana_subs').maybeSingle(),
    getEffectiveRevenueSplit(admin, sub.tenant_id),
  ])
  if (walletError) throw walletError
  if (!wallet?.wallet_address || !sub.provider_subscription_id || !process.env.SOLANA_PLATFORM_WALLET) throw new Error('Receipt reconciliation configuration unavailable')
  const expected = computeSplit(price, effSplit.platformPercentage, 6)
  const conn = new Connection(rpcUrl, 'confirmed')
  const periodEnd = periodStart + Number(state.periodHours) * 3600
  const candidates = (await conn.getSignaturesForAddress(new PublicKey(sub.provider_subscription_id), { limit: 40 }))
    .filter((sig) => !sig.err && sig.blockTime != null && sig.blockTime >= periodStart && sig.blockTime < periodEnd)
  let schoolPaid = BigInt(0), platformPaid = BigInt(0)
  const signatures: string[] = []
  let paidAt = 0
  for (const sig of candidates) {
    const tx = await conn.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 })
    if (!tx?.meta || tx.meta.err) continue
    const delta = (owner: string) => {
      const sum = (balances: NonNullable<typeof tx.meta>['preTokenBalances']) => (balances ?? [])
        .filter((balance) => balance.owner === owner && balance.mint === meta.mint)
        .reduce((amount, balance) => amount + BigInt(balance.uiTokenAmount.amount), BigInt(0))
      return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances)
    }
    const school = delta(wallet.wallet_address), platform = delta(process.env.SOLANA_PLATFORM_WALLET)
    if (school < BigInt(0) || platform < BigInt(0) || school + platform <= BigInt(0) || delta(meta.subscriber) !== -(school + platform)) continue
    schoolPaid += school; platformPaid += platform; signatures.push(sig.signature)
    paidAt = Math.max(paidAt, sig.blockTime ?? 0)
  }
  if (schoolPaid !== BigInt(expected.schoolBase) || platformPaid !== BigInt(expected.platformBase)) {
    throw new Error('Paid chain period requires receipt reconciliation; no new debit allowed')
  }
  const periodStartIso = new Date(periodStart * 1000).toISOString()
  const periodEndIso = new Date(periodEnd * 1000).toISOString()
  const { error } = await admin.rpc('record_solana_renewal', {
    _subscription_id: sub.subscription_id, _period_start: periodStartIso,
    _period_end: periodEndIso, _amount: price, _successful: true,
    _signatures: signatures, _paid_at: new Date(paidAt * 1000).toISOString(), _network: /devnet/i.test(rpcUrl) ? 'devnet' : /testnet/i.test(rpcUrl) ? 'testnet' : 'mainnet-beta',
  })
  if (error) throw error
  return { status: 'paid', signatures, periodEnd: periodEndIso, reconciled: true }
}
