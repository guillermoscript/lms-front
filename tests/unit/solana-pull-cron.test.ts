import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import config from '../../vercel.json'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const mocks = vi.hoisted(() => ({ queue: vi.fn(), renew: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows: mocks.queue }))
vi.mock('@/lib/payments/solana-renewal', () => ({ renewSolanaSubscription: mocks.renew }))
import { GET } from '@/app/api/cron/solana-pull/route'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'mock-cron-secret')
  vi.stubEnv('SOLANA_RPC_URL', 'https://api.devnet.solana.com')
  vi.stubEnv('SOLANA_PULLER_SECRET_KEY', 'mock-only')
  vi.stubEnv('SOLANA_PLATFORM_WALLET', 'mock-wallet')
  vi.stubEnv('SOLANA_USDC_MINT', 'mock-mint')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-only')
  mocks.queue.mockResolvedValue([{ subscription_id: 1 }, { subscription_id: 2 }])
})
afterEach(() => vi.unstubAllEnvs())
const request = (secret = 'mock-cron-secret') => new NextRequest('http://localhost/api/cron/solana-pull', {
  headers: { authorization: `Bearer ${secret}` },
})

describe('scheduled native renewal', () => {
  it('registers exactly one automatic pull job on the existing reconciliation cadence', () => {
    expect(config.crons.filter(job => job.path === '/api/cron/solana-pull'))
      .toEqual([{ path: '/api/cron/solana-pull', schedule: '*/10 * * * *' }])
  })
  it('resolves native renewal in the actual Dokploy GitHub scheduler', () => {
    const workflow = readFileSync('.github/workflows/cron.yml', 'utf8')
    const block = workflow.match(/case "\$\{SCHEDULE:-\}" in[\s\S]*?esac/)
    expect(block).not.toBeNull()
    const routes = execFileSync('bash', ['-c', `${block![0]}\nprintf '%s' "$routes"`], {
      env: { PATH: process.env.PATH, NODE_ENV: 'test', SCHEDULE: '*/10 * * * *' }, encoding: 'utf8',
    }).split(' ')
    expect(routes.filter(route => route === 'solana-pull')).toHaveLength(1)
    expect(routes).toContain('solana-reconcile')
  })
  it('rejects unauthorized scheduled execution before loading any subscriptions', async () => {
    expect((await GET(request('wrong-secret'))).status).toBe(401)
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.renew).not.toHaveBeenCalled()
  })
  it('keeps unconfigured payment rails disabled', async () => {
    vi.stubEnv('SOLANA_PULLER_SECRET_KEY', '')
    expect(await (await GET(request())).json()).toEqual({ success: true, skipped: 'solana_subscriptions_not_configured' })
    expect(mocks.renew).not.toHaveBeenCalled()
  })
  it('uses the same renewal/reconciliation path as student retries', async () => {
    mocks.renew.mockResolvedValueOnce({ status: 'paid', reconciled: true })
      .mockResolvedValueOnce({ status: 'paid', signatures: ['mock-confirmed'] })
    expect(await (await GET(request())).json()).toEqual({ pulled: 1, reconciled: 1, insufficientFunds: 0, errors: 0 })
    expect(mocks.renew).toHaveBeenCalledTimes(2)
  })
  it('does not count unresolved attempts as settled charges and continues the queue', async () => {
    mocks.renew.mockRejectedValueOnce(new Error('mock confirmation uncertainty'))
      .mockResolvedValueOnce({ status: 'insufficient_funds' })
    expect(await (await GET(request())).json()).toEqual({ pulled: 0, reconciled: 0, insufficientFunds: 1, errors: 1 })
  })
})
