/**
 * Abandoned platform-fee pay-now attempts on a hosted rail (#951), end to end
 * against the local stack — WITHOUT a real provider.
 *
 * A hosted fee checkout (Stripe, PayPal, Binance Pay) leaves a `pending`
 * `platform_fee_payments` row with no `platform_payment_requests` row behind
 * it, so nothing ever closed one: every retry added another, and an abandoned
 * attempt looked exactly like one in flight. Two things close them now, and
 * both ask the provider first, because `settle_platform_fee_payment()` credits
 * `pending` rows only (a success landing on a cancelled row is flagged, not
 * credited):
 *
 *  1. Supersede — a new attempt on a rail replaces the open one on that rail.
 *  2. Sweep — `/api/cron/expire-stale-checkouts` cancels request-less rows past
 *     the checkout TTL.
 *
 * PayPal is the rail under test because it is the one with a loopback seam
 * (`PAYPAL_API_BASE`): the stub in this process answers OAuth and Orders v2
 * create/get/capture, and records every hit. One dedicated tenant, the
 * platform-fee-paynow-rails pattern.
 *
 * Run (the app must boot WITH the stub env; a reused dev server has none):
 *   BASE_URL=http://lvh.me:3011 E2E_BASE_URL=http://lvh.me:3011 PORT=3011 \
 *   npx playwright test platform-fee-stale-payments --workers=1
 * PAYPAL_API_BASE (http://127.0.0.1:<port>), PAYPAL_CLIENT_ID/SECRET (any
 * value — the stub checks none) and CRON_SECRET come from .env.local or the CI
 * job env.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, type Page } from './utils/test'
import { login } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  setTenantPlan,
  tenantBase,
  upsertTinyPlan,
  type QaTenant,
} from './utils/plan-gate-fixtures'
import { startLoopbackStub, type LoopbackStub, type StubHit } from './utils/loopback-stub'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000951',
  slug: 'qa-fee-stale-payments',
  name: 'QA Fee Stale Payments',
  planSlug: 'e2e-tiny-fee-stale-payments',
}
const QA_BASE = tenantBase(QA.slug)

const RUN = Date.now()
const TAG = 'fee-stale-e2e'

// 20% of the sale is the platform's fee (no revenue_splits row → 80/20 snapshot).
const USD_SALE = 61.85
const USD_FEE = 12.37

const PAYPAL_BASE = process.env.PAYPAL_API_BASE
const PAYPAL_READY = Boolean(PAYPAL_BASE && process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)

const HOUR_MS = 60 * 60 * 1000
/** Past the 24h default checkout TTL. */
const STALE_AGE_MS = 25 * HOUR_MS

/** What `/api/billing/fees/paypal/capture` reports for an order whose fee payment is no longer open. */
const SUPERSEDED_CAPTURE_CODE = 'payment_closed'

type Admin = ReturnType<typeof getAdmin>

// ---------------------------------------------------------------------------
// PayPal stub state: orders the APP created, plus the ones a test plants.
// ---------------------------------------------------------------------------

interface StubOrder {
  id: string
  customId: string
  referenceId: string
  value: string
  currency: string
  captureId: string | null
}
const orders = new Map<string, StubOrder>()
let orderSeq = 0
let paypalStub: LoopbackStub | undefined

function orderJson(o: StubOrder) {
  return {
    id: o.id,
    status: o.captureId ? 'COMPLETED' : 'APPROVED',
    purchase_units: [
      {
        reference_id: o.referenceId,
        custom_id: o.customId,
        amount: { currency_code: o.currency, value: o.value },
        ...(o.captureId
          ? {
              payments: {
                captures: [
                  {
                    id: o.captureId,
                    status: 'COMPLETED',
                    custom_id: o.customId,
                    amount: { currency_code: o.currency, value: o.value },
                  },
                ],
              },
            }
          : {}),
      },
    ],
  }
}

function paypalHandler(hit: StubHit) {
  if (hit.method === 'POST' && hit.path === '/v1/oauth2/token') {
    return { status: 200, body: { access_token: `stub-${RUN}`, expires_in: 32400, token_type: 'Bearer' } }
  }
  if (hit.method === 'POST' && hit.path === '/v2/checkout/orders') {
    const unit = hit.body?.purchase_units?.[0] ?? {}
    const id = `ORDER-${TAG}-${RUN}-${++orderSeq}`
    orders.set(id, {
      id,
      customId: unit.custom_id,
      referenceId: unit.reference_id,
      value: unit.amount?.value,
      currency: unit.amount?.currency_code,
      captureId: null,
    })
    return {
      status: 201,
      body: {
        id,
        status: 'PAYER_ACTION_REQUIRED',
        links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
      },
    }
  }
  const capture = hit.path.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/)
  if (hit.method === 'POST' && capture) {
    const o = orders.get(capture[1])
    if (!o) return undefined
    if (o.captureId) {
      return { status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] } }
    }
    o.captureId = `CAP-${TAG}-${RUN}-${orderSeq}`
    return { status: 201, body: orderJson(o) }
  }
  const get = hit.path.match(/^\/v2\/checkout\/orders\/([^/]+)$/)
  if (hit.method === 'GET' && get) {
    const o = orders.get(get[1])
    return o ? { status: 200, body: orderJson(o) } : undefined
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedSale(admin: Admin, amount: number) {
  const { error } = await admin.from('transactions').insert({
    user_id: SEEDED.student.id,
    payment_provider: 'manual',
    payment_method: 'manual',
    currency: 'usd',
    amount,
    status: 'successful',
    tenant_id: QA.id,
    product_id: null,
    plan_id: null,
  })
  if (error) throw new Error(`could not seed a sale: ${error.message}`)
}

async function feePayments(admin: Admin) {
  const { data, error } = await admin
    .from('platform_fee_payments')
    .select('payment_id, provider, status, amount, provider_reference, provider_charge_id, review_reason, created_at')
    .eq('tenant_id', QA.id)
  if (error) throw new Error(`could not read platform_fee_payments: ${error.message}`)
  return data ?? []
}

async function statusOf(admin: Admin, paymentId: string) {
  const row = (await feePayments(admin)).find((p) => p.payment_id === paymentId)
  if (!row) throw new Error(`fee payment ${paymentId} not found`)
  return row.status
}

/** A pending fee payment written the way the checkout route writes one, aged on demand. */
async function plantPayment(
  admin: Admin,
  input: { provider: string; reference?: string | null; ageMs?: number; reviewReason?: string },
) {
  const { data, error } = await admin
    .from('platform_fee_payments')
    .insert({
      tenant_id: QA.id,
      currency: 'USD',
      amount: USD_FEE,
      provider: input.provider,
      status: 'pending',
      provider_reference: input.reference ?? null,
      review_reason: input.reviewReason ?? null,
      requested_by: SEEDED.owner.id,
      created_at: new Date(Date.now() - (input.ageMs ?? 0)).toISOString(),
    })
    .select('payment_id')
    .single()
  if (error || !data) throw new Error(`could not plant a fee payment: ${error?.message}`)
  return data.payment_id as string
}

async function age(admin: Admin, paymentId: string, ageMs: number) {
  const { error } = await admin
    .from('platform_fee_payments')
    .update({ created_at: new Date(Date.now() - ageMs).toISOString() })
    .eq('payment_id', paymentId)
  if (error) throw new Error(`could not age fee payment ${paymentId}: ${error.message}`)
}

/** An order on the stub that the app did not create, for a planted row to point at. */
function plantOrder(paymentId: string, captured: boolean): string {
  const id = `ORDER-${TAG}-${RUN}-planted-${++orderSeq}`
  orders.set(id, {
    id,
    customId: `fee|${QA.id}|${paymentId}`,
    referenceId: `platform_fee:${QA.id}:${paymentId}`,
    value: USD_FEE.toFixed(2),
    currency: 'USD',
    captureId: captured ? `CAP-${TAG}-${RUN}-planted-${orderSeq}` : null,
  })
  return id
}

async function postJson(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      let json: Record<string, unknown> | null = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      return { status: res.status, json }
    },
    { path, body },
  )
}

/** Navigate to a redirecting route and return its own Location header. */
async function redirectOf(page: Page, url: string): Promise<URL> {
  const pathname = new URL(url).pathname
  const first = page.waitForResponse((r) => new URL(r.url()).pathname === pathname, { timeout: 60_000 })
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  const res = await first
  expect(res.status(), 'the route answers with a redirect').toBeGreaterThanOrEqual(300)
  expect(res.status()).toBeLessThan(400)
  const location = res.headers()['location']
  expect(location, 'redirect carries a Location').toBeTruthy()
  return new URL(location!, url)
}

async function runSweep(request: APIRequestContext) {
  const res = await request.get(`${BASE}/api/cron/expire-stale-checkouts`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    timeout: 120_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

async function cleanup() {
  const admin = getAdmin()
  // Fee request → payment FK is RESTRICT: requests first.
  await admin.from('platform_fee_audit_log').delete().eq('tenant_id', QA.id)
  await admin.from('platform_payment_requests').delete().eq('tenant_id', QA.id)
  await admin.from('platform_fee_payments').delete().eq('tenant_id', QA.id)
  await admin.from('platform_fee_statements').delete().eq('tenant_id', QA.id)
  await admin.from('tenant_fee_standing').delete().eq('tenant_id', QA.id)
  await admin.from('transactions').delete().eq('tenant_id', QA.id)
  await destroyQaTenant(admin, QA)
}

// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.describe('stale platform fee pay-now attempts on a hosted rail (#951)', () => {
  test.skip(
    !PAYPAL_READY,
    'PAYPAL_API_BASE (http://127.0.0.1:<port>), PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required, and the app server must boot with them',
  )

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state and the provider stub are shared')
  })

  test.beforeAll(async () => {
    const admin = getAdmin()
    await cleanup()
    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 10, max_students: -1 })
    await createQaTenant(admin, QA, 'free')
    await setTenantPlan(admin, QA.id, QA.planSlug)
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await seedSale(admin, USD_SALE)
    paypalStub = await startLoopbackStub(PAYPAL_BASE!, paypalHandler)
  })

  test.afterAll(async () => {
    await paypalStub?.stop()
    paypalStub = undefined
    await cleanup()
  })

  let firstPayment = ''
  let firstOrder = ''
  let firstCaptureUrl = ''
  let secondPayment = ''
  let secondOrder = ''

  test('a second attempt on the same rail supersedes the first: one pending row, not two', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)

    const first = await postJson(page, '/api/billing/fees/checkout', { provider: 'paypal', locale: LOCALE })
    expect(first.status, JSON.stringify(first.json)).toBe(200)
    firstPayment = String(first.json!.paymentId)
    firstOrder = [...orders.keys()].pop()!
    const created = paypalStub!.hitsOn('POST', '/v2/checkout/orders')
    const returnUrl: string = created[0].body.payment_source.paypal.experience_context.return_url
    firstCaptureUrl = `${returnUrl}&token=${encodeURIComponent(firstOrder)}&PayerID=E2EPAYER`
    expect(await statusOf(admin, firstPayment)).toBe('pending')

    // The admin closed the PayPal tab and pressed Pay again.
    const second = await postJson(page, '/api/billing/fees/checkout', { provider: 'paypal', locale: LOCALE })
    expect(second.status, JSON.stringify(second.json)).toBe(200)
    secondPayment = String(second.json!.paymentId)
    secondOrder = [...orders.keys()].pop()!
    expect(secondPayment).not.toBe(firstPayment)
    expect(secondOrder).not.toBe(firstOrder)

    // PayPal was asked about the old order BEFORE its row was cancelled.
    expect(paypalStub!.hitsOn('GET', `/v2/checkout/orders/${firstOrder}`).length).toBeGreaterThanOrEqual(1)

    const rows = await feePayments(admin)
    expect(rows).toHaveLength(2)
    expect(rows.find((p) => p.payment_id === firstPayment)).toMatchObject({ status: 'canceled', review_reason: null })
    expect(rows.find((p) => p.payment_id === secondPayment)).toMatchObject({
      status: 'pending',
      provider_reference: secondOrder,
    })
  })

  test('the superseded order can no longer be captured: no money moves on a cancelled row', async ({ page }) => {
    test.setTimeout(120_000)
    expect(firstCaptureUrl, 'supersede test ran').toBeTruthy()
    const admin = getAdmin()
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)

    const location = await redirectOf(page, firstCaptureUrl)
    expect(location.searchParams.get('paypal')).toBe(SUPERSEDED_CAPTURE_CODE)
    expect(paypalStub!.hitsOn('POST', `/v2/checkout/orders/${firstOrder}/capture`)).toEqual([])
    expect(orders.get(firstOrder)!.captureId).toBeNull()
    expect(await statusOf(admin, firstPayment)).toBe('canceled')
    expect(await statusOf(admin, secondPayment)).toBe('pending')
  })

  test('the sweep cancels a stale request-less row and nothing that is still owned or in motion', async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, 'CRON_SECRET is required to call the sweep')
    test.setTimeout(180_000)
    expect(secondPayment, 'supersede test ran').toBeTruthy()
    const admin = getAdmin()

    // Abandoned a day ago: the row the sweep exists for.
    await age(admin, secondPayment, STALE_AGE_MS)

    // Never opened a checkout at all (the route died between insert and session).
    const objectless = await plantPayment(admin, { provider: 'paypal', ageMs: STALE_AGE_MS })

    // Same age, but each of these must survive:
    // - young: inside the TTL
    const young = await plantPayment(admin, { provider: 'paypal', ageMs: HOUR_MS })
    const youngOrder = plantOrder(young, false)
    await admin.from('platform_fee_payments').update({ provider_reference: youngOrder }).eq('payment_id', young)
    // - captured at PayPal, webhook never delivered: money already taken
    const captured = await plantPayment(admin, { provider: 'paypal', ageMs: STALE_AGE_MS })
    const capturedOrder = plantOrder(captured, true)
    await admin.from('platform_fee_payments').update({ provider_reference: capturedOrder }).eq('payment_id', captured)
    // - flagged for review: a super admin resolves it
    const flagged = await plantPayment(admin, {
      provider: 'paypal',
      ageMs: STALE_AGE_MS,
      reviewReason: 'amount/currency mismatch: expected 12.37 USD, provider reported 1.00 USD',
    })
    // - owned by a fee request with money already reported: the request lifecycle decides
    const requested = await plantPayment(admin, { provider: 'manual', ageMs: STALE_AGE_MS })
    const { error: requestError } = await admin.from('platform_payment_requests').insert({
      tenant_id: QA.id,
      plan_id: null,
      fee_payment_id: requested,
      request_type: 'fee',
      requested_by: SEEDED.owner.id,
      amount: USD_FEE,
      currency: 'usd',
      status: 'payment_received',
      payment_provider: 'manual',
      expires_at: new Date(Date.now() - HOUR_MS).toISOString(),
    })
    expect(requestError, 'fee request insert').toBeNull()

    const result = await runSweep(request)
    const fees = result.fee_payments as Record<string, number>
    // >= : a local database may hold other tenants' leftovers.
    expect(fees.expired, JSON.stringify(result)).toBeGreaterThanOrEqual(2)
    expect(fees.recovered).toBeGreaterThanOrEqual(1)
    expect(fees.skipped).toBeGreaterThanOrEqual(1)

    expect(await statusOf(admin, secondPayment), 'abandoned hosted checkout').toBe('canceled')
    expect(await statusOf(admin, objectless), 'row that never opened a checkout').toBe('canceled')
    expect(await statusOf(admin, young), 'inside the TTL').toBe('pending')
    expect(await statusOf(admin, flagged), 'flagged for review').toBe('pending')
    expect(await statusOf(admin, requested), 'owned by a payment_received request').toBe('pending')
    // Money already taken is never cancelled: the lost webhook's credit is made here instead.
    const settled = (await feePayments(admin)).find((p) => p.payment_id === captured)!
    expect(settled, 'captured at the provider').toMatchObject({
      status: 'succeeded',
      provider_charge_id: orders.get(capturedOrder)!.captureId,
      review_reason: null,
    })
    // Asked PayPal before cancelling the abandoned one.
    expect(paypalStub!.hitsOn('GET', `/v2/checkout/orders/${secondOrder}`).length).toBeGreaterThanOrEqual(1)

    // A second pass has nothing left to cancel.
    const before = (await feePayments(admin)).map((p) => `${p.payment_id}:${p.status}`).sort()
    await runSweep(request)
    const after = (await feePayments(admin)).map((p) => `${p.payment_id}:${p.status}`).sort()
    expect(after).toEqual(before)
  })
})
