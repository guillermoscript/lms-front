/**
 * Local-dev test: exercise the Lemon Squeezy ONE-TIME order webhook end-to-end
 * against the running dev server + local DB — no tunnel, no real LS account.
 *
 * It crafts a signed `order_created` payload (and optionally `order_refunded`),
 * POSTs it to /api/payments/webhook/lemonsqueezy exactly as Lemon Squeezy would,
 * then reads the DB back to prove the buyer got enrolled (and un-enrolled on
 * refund). The signature is computed with the SAME secret the route verifies
 * with, so this is a faithful test of verify → normalize → dispatch → trigger.
 *
 * PREREQS (the route instantiates the provider, which throws if any is unset):
 *   - .env.local has LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID,
 *     LEMONSQUEEZY_WEBHOOK_SECRET (api key/store id may be dummy; the SECRET must
 *     match what the dev server booted with — restart dev after editing .env.local).
 *   - Dev server running. Default target http://localhost:3000.
 *
 * USAGE:
 *   node scripts/test-ls-onetime-webhook.mjs                 # order_created only
 *   node scripts/test-ls-onetime-webhook.mjs --refund        # + order_refunded
 *   node scripts/test-ls-onetime-webhook.mjs --url http://localhost:3005
 *   node scripts/test-ls-onetime-webhook.mjs --user <uuid>   # override test buyer
 */
import { readFileSync } from 'fs'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const getArg = (name) => {
  const i = argv.indexOf(name)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null
}
const DO_REFUND = argv.includes('--refund')
const BASE_URL = getArg('--url') || process.env.TEST_WEBHOOK_URL || 'http://localhost:3000'
const USER_OVERRIDE = getArg('--user')

// ── env ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const TENANT = '00000000-0000-0000-0000-000000000001'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
if (!secret) throw new Error('Missing LEMONSQUEEZY_WEBHOOK_SECRET in .env.local (must match the running dev server)')

const sb = createClient(url, key, { auth: { persistSession: false } })
const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const ok = (name, cond, extra) => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : '  ' + JSON.stringify(extra ?? '')}`)
  if (!cond) failures++
}

// ── 1. resolve a test buyer ────────────────────────────────────────────────
let userId = USER_OVERRIDE
if (!userId) {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 })
  if (error) throw error
  const u = data.users.find((x) => x.email === 'student@e2etest.com')
  if (!u) throw new Error('student@e2etest.com not found — pass --user <uuid>')
  userId = u.id
}
console.log(`buyer: ${userId}`)

// ── 2. find/create a one-time product WITH a product_courses link ──────────
//    (enroll_user enrolls via product_courses, so the link is required)
async function ensureProduct() {
  const { data: existing } = await sb
    .from('products')
    .select('product_id')
    .eq('tenant_id', TENANT)
    .like('name', 'LS Test%')
    .maybeSingle()
  if (existing) {
    const { data: link } = await sb
      .from('product_courses')
      .select('course_id')
      .eq('product_id', existing.product_id)
      .limit(1)
    if (link && link.length) return { productId: existing.product_id, courseId: link[0].course_id }
  }
  // fresh
  const { data: course, error: cErr } = await sb
    .from('courses')
    .insert({ tenant_id: TENANT, title: 'LS Test Course', status: 'published' })
    .select('course_id')
    .single()
  if (cErr) throw cErr
  const { data: product, error: pErr } = await sb
    .from('products')
    .insert({ tenant_id: TENANT, name: 'LS Test Product', price: 29.0, currency: 'usd', payment_provider: 'lemonsqueezy' })
    .select('product_id')
    .single()
  if (pErr) throw pErr
  const { error: lErr } = await sb
    .from('product_courses')
    .insert({ product_id: product.product_id, course_id: course.course_id, tenant_id: TENANT })
  if (lErr) throw lErr
  return { productId: product.product_id, courseId: course.course_id }
}
const { productId, courseId } = await ensureProduct()
console.log(`product: ${productId}  course: ${courseId}`)

// ── 3. clean prior test state so the run is idempotent ─────────────────────
//    (transactions has a partial unique index on (user,product,plan) for
//     pending|successful — stale rows would block a new pending insert)
await sb.from('transactions').delete().eq('product_id', productId).eq('user_id', userId)
await sb.from('entitlements').delete().eq('user_id', userId).eq('source_type', 'product').eq('source_id', productId)
await sb.from('enrollments').delete().eq('user_id', userId).eq('course_id', courseId)

// ── 4. insert the pending transaction the checkout route would have made ───
const { data: tx, error: txErr } = await sb
  .from('transactions')
  .insert({
    user_id: userId,
    tenant_id: TENANT,
    product_id: productId,
    plan_id: null,
    amount: 29.0,
    currency: 'usd',
    status: 'pending',
    payment_provider: 'lemonsqueezy',
  })
  .select('transaction_id')
  .single()
if (txErr) throw txErr
const reference = String(tx.transaction_id)
console.log(`pending transaction: ${reference}\n`)

// ── helper: POST a signed LS event ─────────────────────────────────────────
async function send(eventName) {
  const body = JSON.stringify({
    meta: { event_name: eventName, custom_data: { reference, userId, tenantId: TENANT } },
    data: { id: '900000', attributes: { updated_at: new Date().toISOString() } },
  })
  const res = await fetch(`${BASE_URL}/api/payments/webhook/lemonsqueezy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': sign(body) },
    body,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// ── 5. order_created → enrollment ──────────────────────────────────────────
console.log('▶ order_created')
const created = await send('order_created')
ok('webhook 200', created.status === 200, created)
ok('webhook acked (received)', created.json?.received === true || created.json?.duplicate === true, created.json)

await sleep(400) // let the trigger run
const { data: txAfter } = await sb.from('transactions').select('status').eq('transaction_id', tx.transaction_id).single()
ok('transaction → successful', txAfter?.status === 'successful', txAfter)

const { data: ent } = await sb
  .from('entitlements')
  .select('status')
  .eq('user_id', userId)
  .eq('source_type', 'product')
  .eq('source_id', productId)
ok('entitlement granted', !!ent?.length && ent.some((e) => e.status !== 'revoked'), ent)

const { data: enr } = await sb.from('enrollments').select('enrollment_id, status').eq('user_id', userId).eq('course_id', courseId)
ok('enrolled in course', !!enr?.length, enr)

// ── 6. signature-tamper guard (negative test) ──────────────────────────────
console.log('\n▶ tampered signature (must reject)')
const badBody = JSON.stringify({ meta: { event_name: 'order_created', custom_data: { reference } }, data: { id: '1' } })
const bad = await fetch(`${BASE_URL}/api/payments/webhook/lemonsqueezy`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Signature': 'deadbeef' },
  body: badBody,
})
ok('bad signature → 400', bad.status === 400, bad.status)

// ── 7. optional refund ─────────────────────────────────────────────────────
if (DO_REFUND) {
  console.log('\n▶ order_refunded')
  const refunded = await send('order_refunded')
  ok('webhook 200', refunded.status === 200, refunded)
  await sleep(400)
  const { data: txR } = await sb.from('transactions').select('status').eq('transaction_id', tx.transaction_id).single()
  ok('transaction → refunded', txR?.status === 'refunded', txR)
  const { data: entR } = await sb
    .from('entitlements')
    .select('status')
    .eq('user_id', userId)
    .eq('source_type', 'product')
    .eq('source_id', productId)
  ok('entitlement revoked', !!entR?.length && entR.every((e) => e.status === 'revoked'), entR)
}

console.log(`\n${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
