/**
 * Cap-forcing verification for the #548 pagination sweep.
 *
 * The recipe #533 established, and the only kind of proof that means anything
 * here: a test that passes on a development dataset proves nothing, because on
 * a development dataset every unpaged read is already complete. So lower the
 * API row cap below the fixture, then assert the totals are still right.
 *
 *   1. Lower `max_rows` (supabase/config.toml:18) to 5. The equivalent live
 *      knob is the `pgrst.db_max_rows` role setting, which PostgREST adopts on
 *      NOTIFY without restarting the shared local stack:
 *
 *        ALTER ROLE authenticator SET pgrst.db_max_rows = '5';
 *        NOTIFY pgrst, 'reload config';
 *
 *   2. Seed well past it (37 transactions, 23 payouts, 37 digest candidates).
 *   3. Run the REAL helpers against the REAL PostgREST and assert the totals.
 *
 * Step 0 below re-proves the cap is actually biting on every run — otherwise a
 * green result would only mean the override silently failed to apply.
 *
 * Usage (seed + teardown SQL live alongside this file in the PR description):
 *   npx tsx scripts/qa-548-cap-forcing.mts
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { fetchAllRows } from '../lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '../lib/supabase/fetch-all-rows-in'
import { fetchDigestCandidates } from '../lib/notifications/daily-digest'

const TENANT = '00000000-0000-0000-0000-0000005480ff'
const EXPECTED = { transactions: 37, transactionTotal: 370, payouts: 23, payoutTotal: 69, candidates: 37 }

function env(): { url: string; key: string } {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const pick = (name: string) => out.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm'))?.[1]
  const url = pick('API_URL')
  const key = pick('SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('could not read API_URL / SERVICE_ROLE_KEY from `supabase status`')
  return { url, key }
}

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

const { url, key } = env()
const admin = createClient(url, key, { auth: { persistSession: false } })

console.log('\n0. The cap is real (unpaged reads must come back short)')
const bare = await admin.from('transactions').select('amount', { count: 'exact' }).eq('tenant_id', TENANT)
check('unpaged transactions rows returned', bare.data?.length, 5)
check('...while count reports the true total', bare.count, EXPECTED.transactions)
const bareRpc = await admin.rpc('get_daily_digest_candidates', {
  _after_tenant_id: null,
  _after_user_id: null,
  _limit: 500,
})
check('unpaged candidates RPC rows returned', (bareRpc.data ?? []).length, 5)
if (bare.data?.length !== 5) {
  console.log('\n  The cap is NOT in force — everything below would pass vacuously. Aborting.')
  process.exit(1)
}

console.log('\n1. app/actions/admin/revenue.ts + teacher/revenue — transaction sweep')
const txns = await fetchAllRows<{ amount: string }>('transactions', (from, to) =>
  admin
    .from('transactions')
    .select('amount, currency, transaction_date, product_id, plan_id', { count: 'exact' })
    .eq('tenant_id', TENANT)
    .eq('status', 'successful')
    .order('transaction_id')
    .range(from, to)
)
check('rows read', txns.length, EXPECTED.transactions)
check('summed revenue', txns.reduce((s, t) => s + Number(t.amount), 0), EXPECTED.transactionTotal)
check('no duplicate rows from unstable paging', new Set(txns.map((t) => JSON.stringify(t))).size > 0, true)

console.log('\n2. dashboard/admin/payouts — school-facing ledger')
const payouts = await fetchAllRows<{ amount: string; status: string }>('payouts', (from, to) =>
  admin
    .from('payouts')
    .select('payout_id, amount, currency, status, created_at', { count: 'exact' })
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .order('payout_id', { ascending: false })
    .range(from, to)
)
check('rows read', payouts.length, EXPECTED.payouts)
check(
  'summed "Total paid"',
  payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
  EXPECTED.payoutTotal
)

console.log('\n3. lib/notifications/daily-digest — keyset-paginated candidates RPC')
const candidates = await fetchDigestCandidates(admin)
const mine = candidates.filter((c) => c.tenant_id === TENANT)
check('candidates read for the seeded tenant', mine.length, EXPECTED.candidates)
check('every candidate distinct (keyset advanced strictly)', new Set(mine.map((c) => c.user_id)).size, EXPECTED.candidates)

console.log('\n4. lib/notifications/daily-digest — chunked .in() preference lookup')
const userIds = mine.map((c) => c.user_id)
const prefs = await fetchAllRowsIn<{ user_id: string; email_enabled: boolean }, string>('notification_preferences', userIds, (chunk, from, to) =>
  admin
    .from('notification_preferences')
    .select('user_id, in_app_enabled, email_enabled, email_frequency', { count: 'exact' })
    .in('user_id', chunk)
    .order('id')
    .range(from, to)
)
// Whatever rows exist must ALL come back; a short read here silently re-enables
// email for everyone it dropped.
const { count: prefCount } = await admin
  .from('notification_preferences')
  .select('user_id', { count: 'exact', head: true })
  .in('user_id', userIds.slice(0, 200))
check('preference rows read matches the true count', prefs.length, prefCount ?? 0)

// The acceptance criterion, stated directly: the seeded opt-out sits at index
// 30, far outside a 5-row response. The paged read must see them; the unpaged
// read must not — and whoever the unpaged read misses gets emailed, because
// `resolveChannels(undefined)` reads a missing row as "email on".
const OPTED_OUT = '00000000-0000-0000-0000-548000000030'
const unpaged = await admin
  .from('notification_preferences')
  .select('user_id, email_enabled')
  .in('user_id', userIds.slice(0, 200))
check('paged read sees the opted-out student', prefs.find((p) => p.user_id === OPTED_OUT)?.email_enabled, false)
check('unpaged read would have MISSED them', (unpaged.data ?? []).some((p) => p.user_id === OPTED_OUT), false)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
