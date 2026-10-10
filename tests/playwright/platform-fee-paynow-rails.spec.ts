/**
 * Platform-fee pay-now on the automated rails, end to end against the local
 * stack (#950, docs/PLATFORM_FEE_LEDGER_DESIGN.md §2.4) — WITHOUT real providers.
 *
 * One dedicated tenant (`qa-fee-paynow-rails`, hidden plan row, the
 * platform-fee-lifecycle pattern) owes the platform its commission on manual
 * sales seeded here (no revenue_splits row → 80/20 snapshot → fee = 20%).
 * Every call goes through the shipping routes with a real admin session cookie
 * (in-page `fetch`, so proxy.ts derives `x-tenant-id` from the subdomain), and
 * every credit goes through the real `settle_platform_fee_payment()`.
 *
 * What each rail fakes, and nothing else:
 *  - PayPal: PayPal's host. `PAYPAL_API_BASE` (loopback-only seam) points the
 *    app at a stub in this process (OAuth, Orders v2 create/get/capture,
 *    verify-webhook-signature). Proves: the order is opened in MAJOR units with
 *    the `fee|tenant|payment` custom_id, a non-admin cannot capture, the admin
 *    capture route settles + clears the balance, and (with
 *    PAYPAL_PLATFORM_WEBHOOK_ID) a signed PAYMENT.CAPTURE.COMPLETED replay of the
 *    same capture credits nothing twice.
 *  - Solana: the CHAIN. No RPC stub exists (no spec fakes Solana RPC), so the
 *    on-chain proof is replaced by calling the real stage-1 SQL function
 *    `observe_solana_platform_payment` with a synthetic signature — exactly what
 *    /verify does after `verifyPlatformTransfer` succeeds — and then /verify runs
 *    the real stage-2 fee settlement. Transfer matching (amount, mint,
 *    reference, wrong-amount refusal) is covered by unit tests instead:
 *    tests/unit/solana-fee-verify.test.ts, solana-fee-activation.test.ts,
 *    solana-fee-checkout.test.ts.
 *  - Binance Pay: test.fixme — lib/payments/binance-provider.ts hardcodes
 *    `https://bpay.binanceapi.com` (BINANCE_PAY_BASE_URL, line 44; used by
 *    `api()` line 225 for the order AND for the webhook-verification
 *    certificate, line 314), so there is no loopback seam: a checkout would make
 *    a real outbound call. Unit coverage: tests/unit/binance-fee-paynow.test.ts.
 *  - Hardening: an automated rail refuses a EUR balance
 *    (currency_not_supported_on_rail), an amount under $0.50
 *    (amount_below_minimum), a non-fee rail (unsupported_rail), and a
 *    non-admin (403) — and none of those writes a payment row.
 *
 * Run (the app must boot WITH the stub env; a reused dev server has none):
 *   BASE_URL=http://lvh.me:3011 E2E_BASE_URL=http://lvh.me:3011 PORT=3011 \
 *   PAYPAL_PLATFORM_WEBHOOK_ID=e2e-platform-webhook \
 *   npx playwright test platform-fee-paynow-rails --workers=1
 * PAYPAL_API_BASE (http://127.0.0.1:<port>), PAYPAL_CLIENT_ID/SECRET (any
 * value — the stub checks none) and SOLANA_RPC_URL/SOLANA_PLATFORM_WALLET come
 * from .env.local or the CI job env.
 */
import crypto from 'node:crypto'
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
  id: '00000000-0000-0000-0000-000000000950',
  slug: 'qa-fee-paynow-rails',
  name: 'QA Fee Pay-now Rails',
  planSlug: 'e2e-tiny-fee-paynow-rails',
}
const QA_BASE = tenantBase(QA.slug)

const RUN = Date.now()
/** Every synthetic provider id carries this, so teardown can LIKE-match a crashed run's rows. */
const TAG = 'fee-rails-e2e'

// 20% of each sale is the platform's fee. A non-round fee so a cents/major
// unit slip (1237.00 vs 12.37) cannot pass by coincidence.
const USD_SALE = 61.85 // → fee 12.37
const USD_FEE = 12.37
const EUR_SALE = 50 // → fee 10.00 EUR
const SOLANA_SALE = 25 // → fee 5.00
const SOLANA_FEE = 5

const PAYPAL_BASE = process.env.PAYPAL_API_BASE
const PAYPAL_READY = Boolean(PAYPAL_BASE && process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
const SOLANA_READY = Boolean(process.env.SOLANA_RPC_URL && process.env.SOLANA_PLATFORM_WALLET)

type Admin = ReturnType<typeof getAdmin>

// ---------------------------------------------------------------------------
// PayPal stub state: orders the APP created, captured on demand.
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
  if (hit.method === 'POST' && hit.path === '/v1/notifications/verify-webhook-signature') {
    return { status: 200, body: { verification_status: 'SUCCESS' } }
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

/** A settled bank-transfer sale (service role, as a checkout route would insert it). */
async function seedSale(admin: Admin, amount: number, currency = 'usd') {
  const { error } = await admin.from('transactions').insert({
    user_id: SEEDED.student.id,
    payment_provider: 'manual',
    payment_method: 'manual',
    currency,
    amount,
    status: 'successful',
    tenant_id: QA.id,
    product_id: null,
    plan_id: null,
  })
  if (error) throw new Error(`could not seed a ${currency} sale: ${error.message}`)
}

const cents = (n: number) => Math.round(n * 100) / 100

async function ledger(admin: Admin, currency: string) {
  const { data, error } = await admin.rpc('platform_fee_ledger', { _tenant_id: QA.id })
  if (error) throw new Error(`platform_fee_ledger failed: ${error.message}`)
  const row = ((data ?? []) as { currency: string; accrued: number; paid: number }[]).find(
    (r) => r.currency === currency,
  )
  const accrued = cents(Number(row?.accrued ?? 0))
  const paid = cents(Number(row?.paid ?? 0))
  return { accrued, paid, net: cents(accrued - paid) }
}

async function feePayments(admin: Admin) {
  const { data, error } = await admin
    .from('platform_fee_payments')
    .select('payment_id, provider, status, amount, currency, provider_reference, provider_charge_id, review_reason')
    .eq('tenant_id', QA.id)
  if (error) throw new Error(`could not read platform_fee_payments: ${error.message}`)
  return data ?? []
}

async function feePayment(admin: Admin, paymentId: string) {
  const row = (await feePayments(admin)).find((p) => p.payment_id === paymentId)
  if (!row) throw new Error(`fee payment ${paymentId} not found`)
  return row
}

/** POST JSON from inside the page: same-origin cookies, the tenant host, a real Origin header. */
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

/** Base58 (no 0/O/I/l), signature-length — what a Solana tx signature looks like. */
function syntheticSignature(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  return Array.from(crypto.randomBytes(88), (b) => alphabet[b % alphabet.length]).join('')
}

async function cleanup() {
  const admin = getAdmin()
  await admin.from('webhook_business_effects').delete().like('provider_event_id', `%${TAG}%`)
  await admin.from('webhook_events').delete().like('provider_event_id', `%${TAG}%`)
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

test.describe('platform fee pay-now on Binance / PayPal / Solana (#950)', () => {
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
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    await seedSale(admin, USD_SALE, 'usd')
    await seedSale(admin, EUR_SALE, 'eur')
    if (PAYPAL_READY) paypalStub = await startLoopbackStub(PAYPAL_BASE!, paypalHandler)
  })

  test.afterAll(async () => {
    await paypalStub?.stop()
    paypalStub = undefined
    await cleanup()
  })

  test('hardening: EUR on an automated rail, < $0.50, a non-fee rail and a non-admin are refused, nothing written', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()
    expect(await ledger(admin, 'USD')).toMatchObject({ net: USD_FEE })
    expect(await ledger(admin, 'EUR')).toMatchObject({ net: 10 })

    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    for (const provider of ['paypal', 'binance', 'solana']) {
      const eur = await postJson(page, '/api/billing/fees/checkout', { provider, currency: 'EUR', locale: LOCALE })
      expect(eur.status, `${provider} EUR`).toBe(400)
      expect(eur.json?.code, `${provider} EUR`).toBe('currency_not_supported_on_rail')

      const tiny = await postJson(page, '/api/billing/fees/checkout', { provider, amount: 0.49, locale: LOCALE })
      expect(tiny.status, `${provider} 0.49`).toBe(400)
      expect(tiny.json?.code, `${provider} 0.49`).toBe('amount_below_minimum')
    }
    const ls = await postJson(page, '/api/billing/fees/checkout', { provider: 'lemonsqueezy', locale: LOCALE })
    expect(ls.json?.code).toBe('unsupported_rail')

    // A student of the same school is not an admin.
    const studentPage = await page.context().browser()!.newPage()
    try {
      await login(studentPage, SEEDED.student.email, SEEDED.student.password, QA_BASE)
      const forbidden = await postJson(studentPage, '/api/billing/fees/checkout', { provider: 'paypal', locale: LOCALE })
      expect(forbidden.status).toBe(403)
      expect(forbidden.json?.code).toBe('forbidden')
    } finally {
      await studentPage.close()
    }

    expect(await feePayments(admin)).toEqual([])
    expect(paypalStub?.hitsOn('POST', '/v2/checkout/orders') ?? []).toEqual([])
  })

  test.describe('PayPal (stubbed PAYPAL_API_BASE)', () => {
    test.skip(
      !PAYPAL_READY,
      'PAYPAL_API_BASE (http://127.0.0.1:<port>), PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required, and the app server must boot with them',
    )

    let paymentId = ''
    let orderId = ''
    let captureUrl = ''

    test('checkout opens a one-off Orders v2 order in MAJOR units carrying the fee custom_id', async ({ page }) => {
      test.setTimeout(120_000)
      const admin = getAdmin()
      await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)

      const res = await postJson(page, '/api/billing/fees/checkout', { provider: 'paypal', locale: LOCALE })
      expect(res.status, JSON.stringify(res.json)).toBe(200)
      expect(res.json).toMatchObject({ kind: 'redirect', provider: 'paypal', amount: USD_FEE, currency: 'USD', partial: false })
      paymentId = String(res.json!.paymentId)

      const created = paypalStub!.hitsOn('POST', '/v2/checkout/orders')
      expect(created).toHaveLength(1)
      const unit = created[0].body.purchase_units[0]
      // MAJOR units: '12.37', never Stripe's minor-unit 1237.
      expect(unit.amount).toEqual({ currency_code: 'USD', value: USD_FEE.toFixed(2) })
      expect(unit.custom_id).toBe(`fee|${QA.id}|${paymentId}`)
      expect(created[0].body.intent).toBe('CAPTURE')
      expect(created[0].headers['paypal-request-id']).toBe(`platform_fee:${paymentId}`)
      const returnUrl: string = created[0].body.payment_source.paypal.experience_context.return_url
      expect(returnUrl.startsWith(`${QA_BASE}/api/billing/fees/paypal/capture?next=`)).toBe(true)

      orderId = [...orders.keys()].pop()!
      expect(String(res.json!.url)).toContain(orderId)
      // What PayPal does on approval: back to return_url with ?token=<order id>.
      captureUrl = `${returnUrl}&token=${encodeURIComponent(orderId)}&PayerID=E2EPAYER`

      const payment = await feePayment(admin, paymentId)
      expect(payment).toMatchObject({ provider: 'paypal', status: 'pending', currency: 'USD', provider_reference: orderId })
      expect(Number(payment.amount)).toBe(USD_FEE)
    })

    test('a non-admin cannot capture the fee order', async ({ page }) => {
      test.setTimeout(120_000)
      expect(captureUrl, 'checkout test ran').toBeTruthy()
      await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)

      const location = await redirectOf(page, captureUrl)
      expect(location.searchParams.get('paypal')).toBe('forbidden')
      // Refused BEFORE anything was captured.
      expect(paypalStub!.hitsOn('POST', `/v2/checkout/orders/${orderId}/capture`)).toEqual([])
      expect((await feePayment(getAdmin(), paymentId)).status).toBe('pending')
    })

    test('the admin capture route settles the payment and clears the balance', async ({ page }) => {
      test.setTimeout(120_000)
      const admin = getAdmin()
      await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)

      const location = await redirectOf(page, captureUrl)
      expect(location.origin).toBe(QA_BASE)
      expect(location.pathname).toBe(`/${LOCALE}/dashboard/admin/earnings`)
      expect(location.searchParams.get('fee_payment')).toBe(paymentId)
      expect(location.searchParams.get('paypal')).toBeNull()
      expect(paypalStub!.hitsOn('POST', `/v2/checkout/orders/${orderId}/capture`)).toHaveLength(1)

      const captureId = orders.get(orderId)!.captureId
      await expect.poll(async () => (await feePayment(admin, paymentId)).status, { timeout: 15_000 }).toBe('succeeded')
      const payment = await feePayment(admin, paymentId)
      expect(payment).toMatchObject({ provider_charge_id: captureId, review_reason: null })
      expect(await ledger(admin, 'USD')).toEqual({ accrued: USD_FEE, paid: USD_FEE, net: 0 })
      // The EUR bucket is untouched by a USD payment.
      expect((await ledger(admin, 'EUR')).net).toBe(10)
    })

    test('a signed PAYMENT.CAPTURE.COMPLETED for the same capture is a no-op, and its replay a duplicate', async ({ request }) => {
      test.skip(
        !process.env.PAYPAL_PLATFORM_WEBHOOK_ID,
        'PAYPAL_PLATFORM_WEBHOOK_ID is required on the app server — the platform webhook fails closed without it',
      )
      const admin = getAdmin()
      const order = orders.get(orderId)!
      expect(order.captureId, 'capture test ran').toBeTruthy()
      const eventId = `WH-${TAG}-${RUN}-capture`
      const body = JSON.stringify({
        id: eventId,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        create_time: new Date().toISOString(),
        resource_type: 'capture',
        resource: {
          id: order.captureId,
          status: 'COMPLETED',
          custom_id: order.customId,
          amount: { currency_code: 'USD', value: order.value },
        },
      })
      const headers = {
        'content-type': 'application/json',
        'paypal-transmission-id': `tx-${eventId}`,
        'paypal-transmission-time': new Date().toISOString(),
        'paypal-transmission-sig': `sig-${eventId}`,
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-STUB',
        'paypal-auth-algo': 'SHA256withRSA',
      }
      const url = `${BASE}/api/billing/webhook/paypal`
      const verifyBefore = paypalStub!.hitsOn('POST', '/v1/notifications/verify-webhook-signature').length

      const first = await request.post(url, { headers, data: body })
      expect(first.status(), await first.text()).toBe(200)
      expect(await first.json()).toMatchObject({ received: true, eventStatus: 'accepted' })
      const verifies = paypalStub!.hitsOn('POST', '/v1/notifications/verify-webhook-signature')
      expect(verifies).toHaveLength(verifyBefore + 1)
      expect(verifies.at(-1)!.body.webhook_id).toBe(process.env.PAYPAL_PLATFORM_WEBHOOK_ID)

      const replay = await request.post(url, { headers, data: body })
      expect(replay.status()).toBe(200)
      expect(await replay.json()).toMatchObject({ duplicate: true })

      // Credited once: still one succeeded payment, ledger paid unchanged.
      const rows = await feePayments(admin)
      expect(rows.filter((p) => p.status === 'succeeded')).toHaveLength(1)
      expect(await ledger(admin, 'USD')).toEqual({ accrued: USD_FEE, paid: USD_FEE, net: 0 })
    })
  })

  test.describe('Solana (chain proof replaced by observe_solana_platform_payment)', () => {
    test.skip(!SOLANA_READY, 'SOLANA_RPC_URL and SOLANA_PLATFORM_WALLET are required on the app server')

    let paymentId = ''
    let requestId = ''
    let checkoutPath = ''

    test('checkout returns a QR intent + a fee request row (plan_id NULL, request_type fee)', async ({ page }) => {
      test.setTimeout(120_000)
      const admin = getAdmin()
      await seedSale(admin, SOLANA_SALE, 'usd')
      expect((await ledger(admin, 'USD')).net).toBe(SOLANA_FEE)

      await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
      const res = await postJson(page, '/api/billing/fees/checkout', { provider: 'solana', locale: LOCALE })
      expect(res.status, JSON.stringify(res.json)).toBe(201)
      expect(res.json).toMatchObject({ kind: 'qr', provider: 'solana', amount: SOLANA_FEE, currency: 'USD' })
      expect(String(res.json!.url)).toMatch(/^solana:/)
      paymentId = String(res.json!.paymentId)
      requestId = String(res.json!.requestId)
      checkoutPath = String(res.json!.checkoutPath)
      expect(checkoutPath).toBe(`/${LOCALE}/dashboard/admin/billing/checkout/${requestId}`)

      const { data: req, error } = await admin
        .from('platform_payment_requests')
        .select('plan_id, request_type, fee_payment_id, status, payment_provider, amount, currency, provider_reference, settlement_currency, settlement_base')
        .eq('request_id', requestId)
        .single()
      expect(error).toBeNull()
      expect(req).toMatchObject({
        plan_id: null,
        request_type: 'fee',
        fee_payment_id: paymentId,
        status: 'pending',
        payment_provider: 'solana',
        currency: 'usd',
      })
      expect(Number(req!.amount)).toBe(SOLANA_FEE)
      expect(['usdc', 'sol']).toContain(req!.settlement_currency)
      if (req!.settlement_currency === 'usdc') expect(Number(req!.settlement_base)).toBe(SOLANA_FEE * 1_000_000)

      const payment = await feePayment(admin, paymentId)
      expect(payment).toMatchObject({ provider: 'solana', status: 'pending', provider_reference: req!.provider_reference })

      // One open fee request at a time.
      const again = await postJson(page, '/api/billing/fees/checkout', { provider: 'solana', locale: LOCALE })
      expect(again.status).toBe(409)
      expect(again.json?.code).toBe('fee_request_open')

      // The QR page renders for a fee request. Its verify poll is answered
      // locally so nothing reaches a real RPC.
      await page.route('**/api/billing/solana/verify', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ confirmed: false, kind: 'fee' }) }),
      )
      await page.goto(`${QA_BASE}${checkoutPath}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('platform-solana-checkout')).toBeVisible({ timeout: 30_000 })
      await page.unroute('**/api/billing/solana/verify')
    })

    test('an observed signature settles the fee through /verify; a replay is a no-op', async ({ page }) => {
      test.setTimeout(120_000)
      expect(requestId, 'checkout test ran').toBeTruthy()
      const admin = getAdmin()
      const signature = syntheticSignature()

      // Stage 1, as /verify runs it after verifyPlatformTransfer proves the transfer.
      const { data: observed, error } = await admin.rpc('observe_solana_platform_payment', {
        _request_id: requestId,
        _tenant_id: QA.id,
        _signature: signature,
      })
      expect(error).toBeNull()
      expect((observed as { observation_status: string }[])[0].observation_status).toBe('observed')

      await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
      const res = await postJson(page, '/api/billing/solana/verify', { requestId })
      expect(res.status, JSON.stringify(res.json)).toBe(200)
      expect(res.json).toMatchObject({ confirmed: true, kind: 'fee', state: 'activated', signature })

      const payment = await feePayment(admin, paymentId)
      expect(payment).toMatchObject({ status: 'succeeded', provider_charge_id: signature, review_reason: null })
      expect(await ledger(admin, 'USD')).toEqual({ accrued: cents(USD_FEE + SOLANA_FEE), paid: cents(USD_FEE + SOLANA_FEE), net: 0 })
      const { data: req } = await admin
        .from('platform_payment_requests')
        .select('status, activation_state, provider_charge_id')
        .eq('request_id', requestId)
        .single()
      expect(req).toMatchObject({ activation_state: 'activated', provider_charge_id: signature })

      const replay = await postJson(page, '/api/billing/solana/verify', { requestId })
      expect(replay.status).toBe(200)
      expect(replay.json).toMatchObject({ confirmed: true, kind: 'fee', alreadyProcessed: true })
      expect((await ledger(admin, 'USD')).paid).toBe(cents(USD_FEE + SOLANA_FEE))
      expect((await feePayments(admin)).filter((p) => p.status === 'succeeded')).toHaveLength(PAYPAL_READY ? 2 : 1)

      // The QR page of a settled request sends the admin back to earnings.
      await page.goto(`${QA_BASE}${checkoutPath}`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard/admin/earnings`), { timeout: 30_000 })
    })
  })

  test.describe('Binance Pay', () => {
    test.fixme(
      true,
      'issue #952 — no loopback seam: lib/payments/binance-provider.ts:44 hardcodes https://bpay.binanceapi.com for the order (api(), :225) and the webhook-verification certificate (:314), so checkout would call the real Binance Pay and a signed PAY_SUCCESS cannot be verified against a test key. Needs a PAYPAL_API_BASE-style loopback override; covered meanwhile by tests/unit/binance-fee-paynow.test.ts',
    )

    test('checkout opens a MAJOR-unit USDT order; a signed PAY_SUCCESS settles; a replay is a no-op', async () => {
      // Once the seam exists: stub POST /binancepay/openapi/v3/order (assert
      // orderAmount === 12.37, currency 'USDT', passThroughInfo carries
      // kind/tenant_id/payment_id) and /binancepay/openapi/certificates
      // (certPublic = a PEM generated here with crypto.generateKeyPairSync('rsa')),
      // then POST /api/billing/webhook/binance with BinancePay-Timestamp/Nonce and
      // BinancePay-Signature = base64 RSA-SHA256 of `ts\nnonce\nbody\n`, body
      // { bizType: 'PAY', bizIdStr, bizStatus: 'PAY_SUCCESS', data: JSON of
      // { merchantTradeNo, prepayId, orderAmount: '12.37', currency: 'USDT',
      // passThroughInfo } }; expect payment succeeded, ledger net 0, replay
      // `duplicate: true`.
    })
  })
})
