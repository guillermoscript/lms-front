/**
 * A PayPal capture settles a real transaction and grants real access — over
 * real HTTP, against the real database (#740/#741 follow-up).
 *
 * WHY THIS FILE EXISTS. PayPal is the only student→school rail with TWO
 * settlement entrances, and neither had ever been driven end to end:
 *
 *   1. `/api/payments/paypal/capture` — the buyer's RETURN from the approve
 *      page. Orders v2 does not auto-capture, so this route is what actually
 *      takes the money, and it dispatches `payment.succeeded` itself, with no
 *      `webhook_events` claim in front of it.
 *   2. `/api/payments/webhook/paypal` — `PAYMENT.CAPTURE.COMPLETED`, the
 *      idempotent backstop for a capture whose dispatch (1) lost.
 *
 * `tests/unit/payment-webhook-adapters.test.ts` does drive the REAL adapter
 * through the REAL route, but with `@supabase/supabase-js` and
 * `dispatchBillingEvent` both mocked and no HTTP — so no test has ever proven
 * that either entrance turns into a settled transaction and a granted
 * entitlement, nor that the two agree about which one settles the sale.
 *
 * WHY A STUB, AND WHAT IT COSTS. Unlike Lemon Squeezy, PayPal's signature is
 * not something we can produce: `verifyWebhook` POSTs the event and its five
 * transmission headers to PayPal's verify-webhook-signature API and believes
 * the answer. There is no secret of ours to sign with, so an honest end-to-end
 * needs either a live sandbox delivery (which cannot reach `lvh.me`) or a stub
 * of PayPal's host. This file takes the second: `PAYPAL_API_BASE` (loopback
 * only — see `apiBase()` in lib/payments/paypal-provider.ts, and the comment
 * there for why that is a security boundary and not tidiness) points the APP at
 * a server this spec runs.
 *
 * So what is synthetic here is exactly one thing: PayPal's VERDICT on the
 * signature, plus the payload bytes. Everything downstream is shipping code —
 * the header contract the adapter rebuilds, `normalizeWebhookEvent`, the
 * `webhook_events` claim/complete lease, `dispatchBillingEvent`'s owner
 * binding, the Postgres `after_transaction_update` trigger, `enroll_user`, and
 * `apply_webhook_refund`. What it deliberately does NOT prove is that PayPal's
 * live payload still looks like these fixtures, or that a real transmission
 * signature verifies — only a sandbox account proves those, and the four-way
 * manual matrix in docs/handoff/2026-09-paypal-manual-testing.md is where that
 * lives.
 *
 * THE FIXTURE IS SPEC-OWNED, not seeded — same reasoning as the Lemon Squeezy
 * file: the obvious pair (alice + product 2001) is already entitled by
 * `supabase/seed.sql`, so a purchase there would exercise `enroll_user`'s
 * ON CONFLICT DO UPDATE branch and cleanup would delete a seeded row. This
 * spec owns a tenant (`qa-paypal`), two courses, four products and their
 * `product_courses` rows, so every entitlement is proven CREATED.
 *
 * ROOT HOST, NOT A SUBDOMAIN. Nothing downstream reads tenant context —
 * proxy.ts short-circuits `/api` before every tenant guard, and both entrances
 * find the row by `reference` with a service-role client. A subdomain would
 * make Playwright's NODE-side APIRequestContext resolve it by real DNS
 * (`--host-resolver-rules` is a chromium launch arg and does not apply here).
 *
 * ORDERING. Serial and desktop-only — each test builds on the previous one's DB
 * state, and every case that must observe a PENDING row gets its OWN product:
 * `transactions_unique_product` allows one live row per (user, product), and a
 * settled row can no longer assert "stays pending".
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { BASE } from './utils/constants'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000304',
  slug: 'qa-paypal',
  name: 'QA PayPal',
  // No throwaway platform plan — the tenant stays on `free`. `destroyQaTenant`
  // deletes by this slug, which simply matches nothing.
  planSlug: 'e2e-paypal-no-plan',
}

const PROVIDER = 'paypal'

/**
 * The APP process is what calls PayPal, and only a server Playwright started —
 * or a `npm run dev` whose `.env.local` carries the same line — has the
 * override. The runner's own copy is the closest observable proxy: ci.yml sets
 * it on the job, so this never skips in CI, and if that line is dropped the
 * reason below matches `check-e2e-skips.mjs`'s ENV_SKIP ("not set", "required")
 * and fails the job.
 *
 * The three credentials join the gate because they gate the ROUTE, not the
 * stub: `getPaymentProvider('paypal')` throws without a client id and secret
 * (→ 503 `Provider not configured`, i.e. five "expected 400, received 503"
 * failures instead of a skip), and `verifyWebhook` returns false with no
 * `PAYPAL_WEBHOOK_ID` before it makes any call at all. No value is ever
 * checked by the stub; ci.yml passes synthetic ones.
 */
const STUB_BASE = process.env.PAYPAL_API_BASE
const READY = Boolean(
  STUB_BASE &&
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_WEBHOOK_ID,
)

/** Recommended (and ci.yml's) port; the stub binds whatever port the env names. */
const DEFAULT_STUB_PORT = 3098

const WEBHOOK_URL = `${BASE}/api/payments/webhook/${PROVIDER}`
const CAPTURE_URL = `${BASE}/api/payments/paypal/capture`

const RUN = Date.now()
/** Every synthesised PayPal id carries this so teardown can LIKE-match a crashed run's ledger rows. */
const ID_PREFIX = `paypal-e2e-${RUN}`

const SALE_AMOUNT = 59
const REFUND_SLICE = 12.5

// `WH-…` is PayPal's own event id and the idempotency key the adapter passes
// straight through as `providerEventId`.
const SETTLE_EVENT_ID = `WH-${ID_PREFIX}-settle`
const BADSIG_EVENT_ID = `WH-${ID_PREFIX}-badsig`
const HEADERLESS_EVENT_ID = `WH-${ID_PREFIX}-headerless`
const BINDING_EVENT_ID = `WH-${ID_PREFIX}-binding`
const REFUND_EVENT_ID = `WH-${ID_PREFIX}-refund`

const SETTLE_CAPTURE_ID = `CAP-${ID_PREFIX}-settle`
const RETURN_ORDER_ID = `ORDER-${ID_PREFIX}-return`
const RETURN_CAPTURE_ID = `CAP-${ID_PREFIX}-return`

// ---------------------------------------------------------------------------
// The stub. Inside the Playwright process rather than a second `webServer`
// entry: the app server is always on this same machine, the fixture can be
// reprogrammed between assertions with a plain variable, and a busy port throws
// EADDRINUSE loudly instead of `reuseExistingServer` silently adopting a stale
// stub left by a crashed run.
// ---------------------------------------------------------------------------

interface StubHit {
  method: string
  path: string
  authorization: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

const stubHits: StubHit[] = []
let stubServer: Server | undefined

/** PayPal's verdict on the next signature check. Reprogrammed per test. */
let verificationStatus: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
/**
 * What `POST /v2/checkout/orders/:id/capture` does next. `already_captured` is
 * PayPal's real 422 for a second capture of one order — the branch the capture
 * route recovers from with `getOrder`.
 */
let captureMode: 'ok' | 'already_captured' = 'ok'

function hitsOn(path: string): StubHit[] {
  return stubHits.filter((hit) => hit.path === path)
}

/** The capture object both `captureOrder` and `getOrder` dig out of an order. */
function orderJson(status: string, customId: string) {
  return {
    id: RETURN_ORDER_ID,
    status,
    purchase_units: [
      {
        reference_id: customId.split('|')[0],
        custom_id: customId,
        payments: {
          captures: [
            {
              id: RETURN_CAPTURE_ID,
              status: 'COMPLETED',
              custom_id: customId,
              amount: { currency_code: 'USD', value: SALE_AMOUNT.toFixed(2) },
            },
          ],
        },
      },
    ],
  }
}

/** The `custom_id` the capture route's order carries — set in beforeAll. */
let returnCustomId = ''

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function startStub(base: string) {
  const url = new URL(base)
  // Literally 127.0.0.1 — a fake PayPal answering on the LAN is not a test
  // util, and `localhost` is not good enough either: the stub binds one address
  // while the app's undici resolves the name itself and may try ::1 first,
  // which is an ECONNREFUSED and, for this rail, a silent `verifyWebhook` false.
  if (url.hostname !== '127.0.0.1') {
    throw new Error(
      `PAYPAL_API_BASE must be http://127.0.0.1:<port> for this spec to serve it — not a hostname, which may resolve to ::1 (got ${base})`,
    )
  }
  if (!url.port) {
    throw new Error(
      `PAYPAL_API_BASE must carry an explicit port — the stub binds it (e.g. http://127.0.0.1:${DEFAULT_STUB_PORT})`,
    )
  }

  const server = createServer((req, res) => {
    void (async () => {
      const raw = req.url ?? '/'
      const path = raw.split('?')[0] || '/'
      const text = await readBody(req)
      let parsed: unknown = text
      try {
        parsed = text ? JSON.parse(text) : ''
      } catch {
        /* form-encoded (the OAuth call) stays a string */
      }
      stubHits.push({
        method: req.method ?? 'GET',
        path,
        authorization: req.headers.authorization,
        body: parsed,
      })

      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }

      // OAuth2 client-credentials. Every request builds a fresh adapter
      // (`getPaymentProvider` is called per request), so this is hit once per
      // app-side PayPal call and its Authorization header is the platform
      // credential the seam exists to keep on loopback.
      if (path === '/v1/oauth2/token') {
        json(200, { access_token: `stub-token-${RUN}`, expires_in: 32400, token_type: 'Bearer' })
        return
      }

      if (path === '/v1/notifications/verify-webhook-signature') {
        json(200, { verification_status: verificationStatus })
        return
      }

      if (path === `/v2/checkout/orders/${RETURN_ORDER_ID}/capture`) {
        if (captureMode === 'already_captured') {
          // PayPal's real shape for a second capture. The route matches on the
          // issue name appearing in the thrown message.
          json(422, {
            name: 'UNPROCESSABLE_ENTITY',
            details: [{ issue: 'ORDER_ALREADY_CAPTURED', description: 'Order already captured' }],
          })
          return
        }
        json(201, orderJson('COMPLETED', returnCustomId))
        return
      }

      if (path === `/v2/checkout/orders/${RETURN_ORDER_ID}`) {
        json(200, orderJson('COMPLETED', returnCustomId))
        return
      }

      json(404, { name: 'RESOURCE_NOT_FOUND', path })
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(url.port), '127.0.0.1', resolve)
  })
  stubServer = server
}

async function stopStub() {
  const server = stubServer
  stubServer = undefined
  if (!server) return
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// ---------------------------------------------------------------------------
// Payloads. PayPal packs our whole owner-binding into ONE 127-char string:
// `reference|userId|tenantId` (encodePayPalCustomId). Everything the dispatcher
// needs to refuse someone else's transaction travels in that field.
// ---------------------------------------------------------------------------

function customId(reference: number | string, userId: string, tenantId: string): string {
  return `${reference}|${userId}|${tenantId}`
}

function captureCompleted(opts: { eventId: string; captureId: string; custom: string }): string {
  return JSON.stringify({
    id: opts.eventId,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: new Date().toISOString(),
    resource_type: 'capture',
    resource: {
      id: opts.captureId,
      status: 'COMPLETED',
      custom_id: opts.custom,
      amount: { currency_code: 'USD', value: SALE_AMOUNT.toFixed(2) },
    },
  })
}

/**
 * `PAYMENT.CAPTURE.REFUNDED`. PayPal states money as a decimal STRING in MAJOR
 * units — `'12.50'` is twelve dollars fifty, NOT 12.5 cents — so the adapter
 * parses it and does not scale. Lemon Squeezy's cents live in that adapter; a
 * spec that copies the cents convention here would send a 100x refund and
 * `least(amount, …)` would quietly turn it into a FULL one.
 */
function captureRefunded(opts: {
  eventId: string
  refundId: string
  custom: string
  value: number
  currency?: string
}): string {
  return JSON.stringify({
    id: opts.eventId,
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    create_time: new Date().toISOString(),
    resource_type: 'refund',
    resource: {
      id: opts.refundId,
      status: 'COMPLETED',
      custom_id: opts.custom,
      amount: { currency_code: opts.currency ?? 'USD', value: opts.value.toFixed(2) },
    },
  })
}

/** The five transmission headers `verifyWebhook` requires before it calls PayPal at all. */
function transmissionHeaders(eventId: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'paypal-transmission-id': `tx-${eventId}`,
    'paypal-transmission-time': new Date().toISOString(),
    'paypal-transmission-sig': `sig-${eventId}`,
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-STUB',
    'paypal-auth-algo': 'SHA256withRSA',
  }
}

async function postWebhook(
  request: APIRequestContext,
  body: string,
  headers: Record<string, string>,
) {
  return request.post(WEBHOOK_URL, { headers, data: body })
}

// ---------------------------------------------------------------------------
// DB readers. `transactions` has NO `created_at` — the column is
// `transaction_date`; selecting the former 42703s the whole request.
// ---------------------------------------------------------------------------

type Admin = ReturnType<typeof getAdmin>

async function readTransaction(admin: Admin, transactionId: number) {
  const { data, error } = await admin
    .from('transactions')
    .select(
      'transaction_id, status, user_id, tenant_id, product_id, plan_id, amount, currency, refunded_amount, payment_provider, transaction_date',
    )
    .eq('transaction_id', transactionId)
    .single()
  if (error) throw new Error(`could not read transaction ${transactionId}: ${error.message}`)
  return data
}

/** Every course the product grants — the loop `enroll_user` walks. */
async function coursesOf(admin: Admin, productId: number): Promise<number[]> {
  const { data, error } = await admin
    .from('product_courses')
    .select('course_id')
    .eq('product_id', productId)
    .order('course_id')
  if (error) throw new Error(`could not read product_courses for ${productId}: ${error.message}`)
  return (data ?? []).map((row) => row.course_id as number)
}

async function entitlementsOf(admin: Admin, userId: string, productId: number) {
  const { data, error } = await admin
    .from('entitlements')
    .select('entitlement_id, course_id, tenant_id, source_type, source_id, status, revoked_at')
    .eq('user_id', userId)
    .eq('source_type', 'product')
    .eq('source_id', productId)
    .order('course_id')
  if (error) throw new Error(`could not read entitlements for product ${productId}: ${error.message}`)
  return data ?? []
}

/** `webhook_events` has NO `status` column — state is processed_at / error. */
async function ledgerRows(admin: Admin, providerEventId: string) {
  const { data, error } = await admin
    .from('webhook_events')
    .select('id, event_type, processed_at, error, attempt_count')
    .eq('provider', PROVIDER)
    .eq('provider_event_id', providerEventId)
  if (error) throw new Error(`could not read webhook_events for ${providerEventId}: ${error.message}`)
  return data ?? []
}

async function successfulRowCount(admin: Admin, productId: number): Promise<number> {
  const { count, error } = await admin
    .from('transactions')
    .select('transaction_id', { count: 'exact', head: true })
    .eq('tenant_id', QA.id)
    .eq('product_id', productId)
    .eq('status', 'successful')
  if (error) throw new Error(`could not count settled rows for product ${productId}: ${error.message}`)
  return count ?? 0
}

/**
 * Everything this spec creates, children before parents. Safe on a clean
 * database, and it also runs FIRST in `beforeAll` — that is what makes a second
 * run safe after a crash. Every delete is checked, so a silently failing one (a
 * future FK, an RLS change on the service-role path) surfaces here and not as a
 * baffling assertion failure three tests later.
 */
async function teardown() {
  const admin = getAdmin()
  const wipe = async (what: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run
    if (error) throw new Error(`teardown could not clear ${what}: ${error.message}`)
  }

  await wipe(
    'webhook_business_effects',
    admin
      .from('webhook_business_effects')
      .delete()
      .eq('provider', PROVIDER)
      .like('provider_event_id', '%paypal-e2e-%'),
  )
  await wipe(
    'webhook_events',
    admin.from('webhook_events').delete().eq('provider', PROVIDER).like('provider_event_id', '%paypal-e2e-%'),
  )
  // transactions reference products, and products/product_courses are not part
  // of destroyQaTenant's cascade — drop them in FK order first.
  await wipe('transactions', admin.from('transactions').delete().eq('tenant_id', QA.id))
  await wipe('product_courses', admin.from('product_courses').delete().eq('tenant_id', QA.id))
  await wipe('products', admin.from('products').delete().eq('tenant_id', QA.id))
  // entitlements / enrollments / courses / tenant_users / tenants.
  await destroyQaTenant(admin, QA)
}

test.describe.configure({ mode: 'serial' })

test.describe('PayPal — a capture settles and grants access, from both entrances (#741)', () => {
  test.skip(
    !READY,
    `PAYPAL_API_BASE is not set (the app server must point at the local PayPal stub) and PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID are required — to run this locally put PAYPAL_API_BASE=http://127.0.0.1:${DEFAULT_STUB_PORT} in .env.local AND restart your dev server, since a server already listening cannot be handed an env var`,
  )

  let courseIds: number[] = []
  let saleProductId: number
  let bindingProductId: number
  let headerlessProductId: number
  let returnProductId: number
  let saleTransactionId: number
  let bindingTransactionId: number
  let headerlessTransactionId: number
  let returnTransactionId: number
  let saleCustom: string
  let bindingCustom: string
  let headerlessCustom: string

  test.beforeAll(async () => {
    const admin = getAdmin()
    await teardown() // a crashed previous run must not poison this one
    if (READY) await startStub(STUB_BASE!)

    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')

    // TWO courses on the sold product: `enroll_user` loops `product_courses`,
    // and a one-course fixture cannot tell a loop from a single insert.
    courseIds = [
      await insertCourse(admin, QA.id, `PayPal Settlement Course A ${RUN}`, { status: 'published' }),
      await insertCourse(admin, QA.id, `PayPal Settlement Course B ${RUN}`, { status: 'published' }),
    ].sort((a, b) => a - b)

    const insertProduct = async (name: string, courses: number[]): Promise<number> => {
      const { data, error } = await admin
        .from('products')
        .insert({
          name,
          description: 'PayPal settlement fixture',
          price: SALE_AMOUNT,
          currency: 'usd',
          status: 'active',
          payment_provider: PROVIDER,
          tenant_id: QA.id,
        })
        .select('product_id')
        .single()
      if (error) throw new Error(`could not insert product "${name}": ${error.message}`)
      const id = data.product_id as number
      for (const courseId of courses) {
        const { error: mapError } = await admin
          .from('product_courses')
          .insert({ product_id: id, course_id: courseId, tenant_id: QA.id })
        if (mapError) {
          throw new Error(`could not map product ${id} to course ${courseId}: ${mapError.message}`)
        }
      }
      return id
    }

    saleProductId = await insertProduct(`PayPal Settlement Bundle ${RUN}`, courseIds)
    bindingProductId = await insertProduct(`PayPal Binding Bundle ${RUN}`, [courseIds[0]])
    headerlessProductId = await insertProduct(`PayPal Headerless Bundle ${RUN}`, [courseIds[0]])
    returnProductId = await insertProduct(`PayPal Return Bundle ${RUN}`, courseIds)

    /**
     * `authenticated` has no INSERT grant on transactions (#538) — every row is
     * service-role. Seeded `pending`: an inserted `successful` row would fire
     * the same trigger and we could not tell the settlement from the insert.
     *
     * Seeded with a DIFFERENT provider on purpose. The dispatcher's settle write
     * is `update({ status: 'successful', payment_provider: provider })`
     * (webhook-dispatch.ts:526); seeding `paypal` would make the
     * payment_provider assertion pass for the wrong reason — it would keep
     * passing if that key were dropped from the update.
     */
    const seedPending = async (product: number): Promise<number> => {
      const { data, error } = await admin
        .from('transactions')
        .insert({
          user_id: SEEDED.student.id,
          product_id: product,
          plan_id: null, // plan-shaped rows are owned by subscription.activated
          amount: SALE_AMOUNT,
          currency: 'usd',
          status: 'pending',
          tenant_id: QA.id,
          payment_provider: 'manual',
        })
        .select('transaction_id')
        .single()
      if (error) throw new Error(`could not seed transaction for product ${product}: ${error.message}`)
      return data.transaction_id as number
    }

    saleTransactionId = await seedPending(saleProductId)
    bindingTransactionId = await seedPending(bindingProductId)
    headerlessTransactionId = await seedPending(headerlessProductId)
    returnTransactionId = await seedPending(returnProductId)

    saleCustom = customId(saleTransactionId, SEEDED.student.id, QA.id)
    // Correctly "signed", correct tenant — but names the WRONG buyer.
    bindingCustom = customId(bindingTransactionId, SEEDED.owner.id, QA.id)
    headerlessCustom = customId(headerlessTransactionId, SEEDED.student.id, QA.id)
    returnCustomId = customId(returnTransactionId, SEEDED.student.id, QA.id)
  })

  test.afterAll(async () => {
    await stopStub()
    await teardown()
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!['desktop-chromium', 'human'].includes(testInfo.project.name), 'runs once — DB state is shared')
    // Locally the webServer is `next dev`, and the first request below is this
    // suite's first hit on these routes — it pays Turbopack's on-demand compile
    // inside the test budget. The shared 30 s (playwright.config.ts:50) is not
    // enough for a cold server; CI runs `next start` on a prebuilt app.
    testInfo.setTimeout(120_000)
    verificationStatus = 'SUCCESS'
    captureMode = 'ok'
    stubHits.length = 0
  })

  test('an event PayPal refuses to verify is rejected and writes nothing', async ({ request }) => {
    const admin = getAdmin()
    verificationStatus = 'FAILURE'

    const body = captureCompleted({
      eventId: BADSIG_EVENT_ID,
      captureId: `CAP-${ID_PREFIX}-badsig`,
      custom: saleCustom,
    })
    const res = await postWebhook(request, body, transmissionHeaders(BADSIG_EVENT_ID))
    expect(res.status(), await res.text()).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid signature' })

    // PayPal WAS asked — the refusal is its answer, not a local short-circuit.
    // The next test is the one that proves the local short-circuit still exists.
    expect(hitsOn('/v1/notifications/verify-webhook-signature')).toHaveLength(1)

    // LOAD-BEARING: verification runs BEFORE the claim, so the ledger must be
    // untouched. This is the only line here that proves anything at this point —
    // the two below are true before the request too. Keep them as a tripwire for
    // a future reorder, but never delete this one.
    expect(await ledgerRows(admin, BADSIG_EVENT_ID)).toHaveLength(0)

    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('pending')
    expect(await entitlementsOf(admin, SEEDED.student.id, saleProductId)).toHaveLength(0)
  })

  test('an event missing a transmission header is refused without asking PayPal', async ({ request }) => {
    const admin = getAdmin()
    const headers = transmissionHeaders(HEADERLESS_EVENT_ID)
    delete headers['paypal-transmission-sig']

    const body = captureCompleted({
      eventId: HEADERLESS_EVENT_ID,
      captureId: `CAP-${ID_PREFIX}-headerless`,
      custom: headerlessCustom,
    })
    const res = await postWebhook(request, body, headers)
    expect(res.status(), await res.text()).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid signature' })

    // The point of this case: an unsigned POST must not cost a PayPal round
    // trip, or an unauthenticated caller could drive our API quota by flooding
    // this endpoint. `verifyWebhook` returns false on the missing header before
    // it fetches a token.
    expect(stubHits).toHaveLength(0)

    expect(await ledgerRows(admin, HEADERLESS_EVENT_ID)).toHaveLength(0)
    const tx = await readTransaction(admin, headerlessTransactionId)
    expect(tx.status).toBe('pending')
  })

  test('a verified PAYMENT.CAPTURE.COMPLETED settles the transaction and grants every mapped course', async ({
    request,
  }) => {
    const admin = getAdmin()
    const courses = await coursesOf(admin, saleProductId)
    expect(courses).toEqual(courseIds)

    const body = captureCompleted({
      eventId: SETTLE_EVENT_ID,
      captureId: SETTLE_CAPTURE_ID,
      custom: saleCustom,
    })
    const res = await postWebhook(request, body, transmissionHeaders(SETTLE_EVENT_ID))
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, eventStatus: 'accepted' })

    // What we actually sent PayPal. The adapter rebuilds this envelope from the
    // headers and `PAYPAL_WEBHOOK_ID`, and a verification that silently dropped
    // one field would verify nothing at all — PayPal would answer on whatever
    // was left.
    const verifyHits = hitsOn('/v1/notifications/verify-webhook-signature')
    expect(verifyHits).toHaveLength(1)
    expect(verifyHits[0].body).toMatchObject({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-STUB',
      transmission_id: `tx-${SETTLE_EVENT_ID}`,
      transmission_sig: `sig-${SETTLE_EVENT_ID}`,
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      // The event goes back up as PARSED JSON, not as the raw string.
      webhook_event: { id: SETTLE_EVENT_ID, event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    })
    expect(verifyHits[0].body.transmission_time).toBeTruthy()
    // And the call was authenticated with a token minted from our own
    // credentials — the reason `apiBase()` refuses a non-loopback override.
    const tokenHits = hitsOn('/v1/oauth2/token')
    expect(tokenHits).toHaveLength(1)
    expect(tokenHits[0].authorization).toMatch(/^Basic /)
    expect(verifyHits[0].authorization).toBe(`Bearer stub-token-${RUN}`)

    // The dispatcher's only write. A 200 alone proves nothing: four of the five
    // ways payment.succeeded fails are silent 200s.
    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('successful')
    // Seeded 'manual' — this is the other half of that one update statement.
    expect(tx.payment_provider).toBe(PROVIDER)
    expect(Number(tx.refunded_amount)).toBe(0)

    // Everything below is Postgres: after_transaction_update → enroll_user,
    // which loops ALL of product_courses (hence two courses on this product).
    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(courses.length)
    for (const course of courses) {
      expect(grants).toContainEqual(
        expect.objectContaining({
          course_id: course,
          // enroll_user takes the tenant from product_courses, not the transaction.
          tenant_id: QA.id,
          source_type: 'product',
          source_id: saleProductId,
          status: 'active',
          revoked_at: null,
        }),
      )
    }

    const ledger = await ledgerRows(admin, SETTLE_EVENT_ID)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ event_type: 'payment.succeeded', error: null, attempt_count: 1 })
    expect(ledger[0].processed_at).not.toBeNull()
  })

  test('redelivering the same WH- event is acked as a duplicate and grants nothing twice', async ({
    request,
  }) => {
    const admin = getAdmin()
    const body = captureCompleted({
      eventId: SETTLE_EVENT_ID,
      captureId: SETTLE_CAPTURE_ID,
      custom: saleCustom,
    })
    const res = await postWebhook(request, body, transmissionHeaders(SETTLE_EVENT_ID))
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({
      received: true,
      duplicate: true,
      eventStatus: 'already_completed',
    })

    // `claim_webhook_event` answered 'completed', so the dispatcher never ran —
    // and that path returns without touching the row, so attempt_count is still
    // the 1 written by the original claim (a re-claim would have made it 2).
    const replayed = await ledgerRows(admin, SETTLE_EVENT_ID)
    expect(replayed).toHaveLength(1)
    expect(replayed[0]).toMatchObject({ attempt_count: 1 })

    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('successful')
    expect(Number(tx.refunded_amount)).toBe(0)
    expect(await successfulRowCount(admin, saleProductId)).toBe(1)

    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(courseIds.length)
    expect(grants.every((row) => row.status === 'active')).toBe(true)
  })

  test('a verified event whose custom_id names a different buyer refuses to settle', async ({ request }) => {
    const admin = getAdmin()
    const body = captureCompleted({
      eventId: BINDING_EVENT_ID,
      captureId: `CAP-${ID_PREFIX}-binding`,
      custom: bindingCustom, // correct tenant, WRONG userId
    })
    const res = await postWebhook(request, body, transmissionHeaders(BINDING_EVENT_ID))

    // The owner check fails CLOSED: dispatchBillingEvent throws, so the route
    // releases the claim and 500s (PayPal retries) rather than acking. This is
    // the guard that keeps a `reference` — a sequential transaction id anyone
    // can guess — from being enough to settle someone else's purchase.
    expect(res.status(), await res.text()).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Dispatch failed' })

    const tx = await readTransaction(admin, bindingTransactionId)
    expect(tx.status).toBe('pending')
    expect(await entitlementsOf(admin, SEEDED.student.id, bindingProductId)).toHaveLength(0)
    expect(await entitlementsOf(admin, SEEDED.owner.id, bindingProductId)).toHaveLength(0)

    const ledger = await ledgerRows(admin, BINDING_EVENT_ID)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].processed_at).toBeNull()
    expect(ledger[0].error).toContain('owner mismatch')
    // Claimed once and RELEASED, not re-claimed: `fail_webhook_event` clears the
    // lease without bumping the counter, so PayPal's retry can claim it.
    expect(ledger[0].attempt_count).toBe(1)
  })

  test('a partial PAYMENT.CAPTURE.REFUNDED records the slice and keeps the sale and the access', async ({
    request,
  }) => {
    const admin = getAdmin()
    const body = captureRefunded({
      eventId: REFUND_EVENT_ID,
      refundId: `REF-${ID_PREFIX}-partial`,
      custom: saleCustom,
      value: REFUND_SLICE, // MAJOR units — PayPal does not speak cents
    })
    const res = await postWebhook(request, body, transmissionHeaders(REFUND_EVENT_ID))
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, eventStatus: 'accepted' })

    // $12.50 off a $59 sale is nowhere near `amount - 0.005`, so the sale stands
    // and only the slice is recorded, in MAJOR units of the row's own currency.
    // LOAD-BEARING: `refunded_amount` is the only line here that a no-op
    // `apply_webhook_refund` would fail — the row was already `successful` with
    // active grants when the settlement test ended.
    const tx = await readTransaction(admin, saleTransactionId)
    expect(Number(tx.refunded_amount)).toBeCloseTo(REFUND_SLICE, 2)
    expect(tx.status).toBe('successful')
    expect(Number(tx.amount)).toBeCloseTo(SALE_AMOUNT, 2)

    // Revocation is gated on status = 'refunded'; a partial must not revoke.
    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(courseIds.length)
    for (const grant of grants) {
      expect(grant.status).toBe('active')
      expect(grant.revoked_at).toBeNull()
    }

    // Refund dedupe lives in webhook_business_effects, not webhook_events.
    const { data: effects, error: effectsError } = await admin
      .from('webhook_business_effects')
      .select('effect_type, target_id')
      .eq('provider', PROVIDER)
      .eq('provider_event_id', REFUND_EVENT_ID)
    if (effectsError) throw new Error(`could not read webhook_business_effects: ${effectsError.message}`)
    expect(effects).toEqual([{ effect_type: 'refund', target_id: String(saleTransactionId) }])

    const ledger = await ledgerRows(admin, REFUND_EVENT_ID)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ event_type: 'refund.succeeded', error: null })
    expect(ledger[0].processed_at).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // The OTHER entrance: the buyer's return from PayPal's approve page. No
  // signature, no `webhook_events` claim — authority comes from the capture
  // call succeeding with OUR credentials plus the same owner binding.
  // -------------------------------------------------------------------------

  test('the buyer returning from PayPal captures the order, settles it, and lands on the success page', async ({
    request,
  }) => {
    const admin = getAdmin()
    const next = `${BASE}/en/checkout/success?transactionId=${returnTransactionId}`

    // maxRedirects: 0 — following the 307 would fetch the success PAGE, and a
    // page render is not what this asserts (it also needs a session this
    // APIRequestContext does not have).
    const res = await request.get(
      `${CAPTURE_URL}?token=${RETURN_ORDER_ID}&next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    )
    expect([302, 307].includes(res.status()), await res.text()).toBe(true)
    expect(res.headers()['location']).toBe(next)

    // The route captured — this is the call that actually takes the buyer's
    // money, and Orders v2 will not do it on its own.
    expect(hitsOn(`/v2/checkout/orders/${RETURN_ORDER_ID}/capture`)).toHaveLength(1)

    const tx = await readTransaction(admin, returnTransactionId)
    expect(tx.status).toBe('successful')
    expect(tx.payment_provider).toBe(PROVIDER)

    const grants = await entitlementsOf(admin, SEEDED.student.id, returnProductId)
    expect(grants).toHaveLength(courseIds.length)
    expect(grants.every((row) => row.status === 'active')).toBe(true)

    // The capture route dispatches DIRECTLY — no claim, no ledger row. That is
    // why the webhook is the backstop and not the other way round, and why the
    // `.eq('status','pending')` guard inside the dispatcher is what keeps the
    // two entrances from settling one sale twice.
    expect(await ledgerRows(admin, `paypal-capture:${RETURN_CAPTURE_ID}`)).toHaveLength(0)
  })

  test('refreshing the return URL re-reads the captured order and settles nothing twice', async ({
    request,
  }) => {
    const admin = getAdmin()
    captureMode = 'already_captured'
    const next = `${BASE}/en/checkout/success?transactionId=${returnTransactionId}`

    const res = await request.get(
      `${CAPTURE_URL}?token=${RETURN_ORDER_ID}&next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    )
    expect([302, 307].includes(res.status()), await res.text()).toBe(true)
    // No `?paypal=capture_failed` — ORDER_ALREADY_CAPTURED is a refresh, not a
    // failure, and stranding the buyer on an error page for one would be a
    // support ticket about money they already paid.
    expect(res.headers()['location']).toBe(next)

    // It recovered through getOrder rather than treating the 422 as fatal.
    expect(hitsOn(`/v2/checkout/orders/${RETURN_ORDER_ID}/capture`)).toHaveLength(1)
    expect(hitsOn(`/v2/checkout/orders/${RETURN_ORDER_ID}`)).toHaveLength(1)

    const tx = await readTransaction(admin, returnTransactionId)
    expect(tx.status).toBe('successful')
    expect(await successfulRowCount(admin, returnProductId)).toBe(1)
    expect(await entitlementsOf(admin, SEEDED.student.id, returnProductId)).toHaveLength(courseIds.length)
  })

  test('a return URL pointing at someone else’s origin falls back to our own success page', async ({
    request,
  }) => {
    // Open-redirect guard. `next` arrives on the query string of a route with no
    // session requirement, so it is attacker-controllable by construction: a
    // link mailed to a buyer could otherwise bounce them to a lookalike
    // "payment failed, re-enter your card" page carrying our own domain in the
    // referrer.
    const hostile = 'https://evil.example.com/checkout/success'
    const res = await request.get(
      `${CAPTURE_URL}?token=${RETURN_ORDER_ID}&next=${encodeURIComponent(hostile)}`,
      { maxRedirects: 0 },
    )
    expect([302, 307].includes(res.status()), await res.text()).toBe(true)
    expect(res.headers()['location']).toBe(`${BASE}/checkout/success`)
  })
})
