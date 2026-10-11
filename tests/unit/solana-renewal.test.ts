import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: vi.fn(), pull: vi.fn(), balance: vi.fn(), rpc: vi.fn(), from: vi.fn(), signatures: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/payments/solana-subscriptions', () => ({ getSubscriptionState: mocks.state }))
vi.mock('@/lib/payments/solana-subscription-pull', () => ({ pullSplitForSubscription: mocks.pull }))
vi.mock('@solana/web3.js', async (original) => {
  const actual = await original<typeof import('@solana/web3.js')>()
  return { ...actual, Connection: class { getTokenAccountBalance = mocks.balance; getSignaturesForAddress = mocks.signatures; getParsedTransaction = mocks.transaction } }
})
import { renewSolanaSubscription, type SolanaRenewalRow } from '@/lib/payments/solana-renewal'

const NOW = Math.floor(Date.now() / 1000)
const row: SolanaRenewalRow = {
  subscription_id: 1, start_date: new Date((NOW - 3601) * 1000).toISOString(),
  tenant_id: 'school', plan_id: 1, subscription_status: 'active',
  cancel_at_period_end: false, cancel_at: null,
  provider_subscription_id: 'CP8Jnkz23u7V1a2Nq3n7BBTjZYB5EjhicjHCLJNbvCGE',
  provider_metadata: {
    subscriber: 'FmJvMsNXi8xcXAh7qDwToEhijT9my4bkQKDtMUwZpHRj',
    merchant: 'FmJvMsNXi8xcXAh7qDwToEhijT9my4bkQKDtMUwZpHRj',
    planId: '1', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  }, plans: { price: 0.01 },
}
const admin = { from: mocks.from, rpc: mocks.rpc } as unknown as Parameters<typeof renewSolanaSubscription>[0]

function query(table: string, freshStatus = 'active') {
  const q = {
    select: vi.fn(() => q), eq: vi.fn(() => q),
    order: vi.fn(() => q), limit: vi.fn(async () => ({ data: [], error: null })),
    single: vi.fn(async () => ({ data: { subscription_status: freshStatus, cancel_at_period_end: false }, error: null })),
    maybeSingle: vi.fn(async () => ({ data: table === 'tenant_payment_wallets'
      ? { wallet_address: 'So11111111111111111111111111111111111111112' }
      : { platform_percentage: 20 }, error: null })),
  }
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com'
  process.env.SOLANA_PULLER_SECRET_KEY = 'test-only-mocked-secret'
  process.env.SOLANA_PLATFORM_WALLET = '11111111111111111111111111111111'
  mocks.from.mockImplementation((table) => query(table))
  mocks.state.mockResolvedValue({ currentPeriodStartTs: BigInt(NOW - 3601), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
  mocks.balance.mockResolvedValue({ value: { amount: '0', uiAmountString: '0' } })
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.signatures.mockResolvedValue([])
  mocks.pull.mockResolvedValue(['confirmed-signature'])
})

describe('Solana renewal payment state', () => {
  it('real balance insufficient: records failed attempt, never submits a pull or grants access', async () => {
    expect(await renewSolanaSubscription(admin, row)).toEqual({ status: 'insufficient_funds', amount: 0.01, balance: '0' })
    expect(mocks.pull).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('record_solana_renewal', expect.objectContaining({ _successful: false, _error_code: 'insufficient_funds' }))
  })
  it('funded past-due retry records only confirmed payment and its actual on-chain period', async () => {
    mocks.balance.mockResolvedValue({ value: { amount: '10000', uiAmountString: '0.01' } })
    mocks.state.mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 3601), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
      .mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 3601), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
      .mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 1), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
    const result = await renewSolanaSubscription(admin, { ...row, subscription_status: 'past_due' })
    expect(result.status).toBe('paid')
    expect(mocks.pull).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('record_solana_renewal', expect.objectContaining({ _successful: true, _signatures: ['confirmed-signature'], _period_start: new Date((NOW - 1) * 1000).toISOString() }))
  })
  it('cancellation after queue read prevents any renewal charge', async () => {
    mocks.from.mockImplementation((table) => query(table, 'canceled'))
    expect((await renewSolanaSubscription(admin, row)).status).toBe('canceled')
    expect(mocks.balance).not.toHaveBeenCalled()
    expect(mocks.pull).not.toHaveBeenCalled()
  })
  it('unknown confirmation timeout does not manufacture a paid or failed receipt', async () => {
    mocks.balance.mockResolvedValue({ value: { amount: '10000', uiAmountString: '0.01' } })
    mocks.pull.mockRejectedValue(new Error('confirmation timeout'))
    await expect(renewSolanaSubscription(admin, row)).rejects.toThrow('confirmation timeout')
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_solana_renewal', expect.anything())
  })
  it('confirmed transfer with a failed receipt commit rejects success without submitting another payment', async () => {
    mocks.balance.mockResolvedValue({ value: { amount: '10000', uiAmountString: '0.01' } })
    mocks.state.mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 3601), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
      .mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 3601), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
      .mockResolvedValueOnce({ currentPeriodStartTs: BigInt(NOW - 1), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
    mocks.rpc.mockImplementation(async (fn) => ({ data: true, error: fn === 'record_solana_renewal' ? new Error('database unavailable') : null }))
    await expect(renewSolanaSubscription(admin, row)).rejects.toThrow('database unavailable')
    expect(mocks.pull).toHaveBeenCalledTimes(1)
  })
  function confirmedTransfer() {
    mocks.state.mockResolvedValue({ currentPeriodStartTs: BigInt(NOW - 1), periodHours: BigInt(1), expiresAtTs: BigInt(0), amountPulledInPeriod: BigInt(10000) })
    mocks.signatures.mockResolvedValue([{signature:'landed-before-timeout',err:null,blockTime:NOW}])
    const owners=[(row.provider_metadata as {subscriber:string}).subscriber,'So11111111111111111111111111111111111111112','11111111111111111111111111111111']
    const balances=(amounts:string[])=>owners.map((owner,i)=>({owner,mint:(row.provider_metadata as {mint:string}).mint,uiTokenAmount:{amount:amounts[i]}}))
    mocks.transaction.mockResolvedValue({meta:{err:null,preTokenBalances:balances(['10000','0','0']),postTokenBalances:balances(['0','8000','2000'])}})
  }
  it('retry after lost confirmation repairs the exact receipt from chain without sending another transfer', async () => {
    confirmedTransfer()
    expect(await renewSolanaSubscription(admin,row)).toEqual({status:'paid',signatures:['landed-before-timeout'],periodEnd:new Date((NOW-1+3600)*1000).toISOString(),reconciled:true})
    expect(mocks.pull).not.toHaveBeenCalled()
    expect(mocks.balance).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('record_solana_renewal',expect.objectContaining({_successful:true,_signatures:['landed-before-timeout'],_paid_at:new Date(NOW*1000).toISOString()}))
  })
  it('rejects a receipt candidate whose split does not match the school/platform amounts', async () => {
    confirmedTransfer()
    mocks.transaction.mockResolvedValue({meta:{err:null,preTokenBalances:[],postTokenBalances:[]}})
    await expect(renewSolanaSubscription(admin,row)).rejects.toThrow('requires receipt reconciliation')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.pull).not.toHaveBeenCalled()
  })
  it('recovery-only check never debits a due subscription', async () => {
    expect(await renewSolanaSubscription(admin, row, { recoveryOnly: true })).toEqual({ status: 'not_due' })
    expect(mocks.pull).not.toHaveBeenCalled()
    expect(mocks.balance).not.toHaveBeenCalled()
  })
  it('reconciles a canceled subscription without reauthorizing charging', async () => {
    confirmedTransfer()
    expect((await renewSolanaSubscription(admin, {...row, subscription_status: 'canceled'})).status).toBe('paid')
    expect(mocks.pull).not.toHaveBeenCalled()
  })
  it('cancellation during wallet lookup stops the transfer', async () => {
    mocks.balance.mockResolvedValue({ value: { amount: '10000', uiAmountString: '0.01' } })
    mocks.state.mockResolvedValueOnce({currentPeriodStartTs:BigInt(NOW-3601),periodHours:BigInt(1),expiresAtTs:BigInt(0),amountPulledInPeriod:BigInt(10000)})
      .mockResolvedValueOnce({currentPeriodStartTs:BigInt(NOW-3601),periodHours:BigInt(1),expiresAtTs:BigInt(NOW+100),amountPulledInPeriod:BigInt(10000)})
    expect((await renewSolanaSubscription(admin,row)).status).toBe('canceled')
    expect(mocks.pull).not.toHaveBeenCalled()
  })
  it('does not renew or reactivate a canceled subscription even if the chain shows a due period', async () => {
    expect(await renewSolanaSubscription(admin,{...row,subscription_status:'canceled'})).toEqual({status:'not_due'})
    expect(mocks.pull).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
