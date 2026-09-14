/**
 * A Lemon Squeezy order settles a real transaction and grants real access —
 * over real HTTP, against the real database (#740 follow-up).
 *
 * WHY THIS FILE EXISTS. Of the eight payment rails, only `stripe` and `manual`
 * ever had an end-to-end money path. `tests/unit/payment-webhook-route.test.ts`
 * mocks `getPaymentProvider` wholesale (its `verifyWebhook` always resolves
 * true), and the newer `tests/unit/payment-webhook-adapters.test.ts` does drive
 * the REAL Lemon Squeezy adapter through the REAL route — but with
 * `@supabase/supabase-js` and `dispatchBillingEvent` both mocked, a hand-faked
 * `NextRequest`, and no HTTP. So nothing has ever proven, against a live server
 * and a live database, that a signed Lemon Squeezy webhook turns into a settled
 * transaction and a granted entitlement. The `order_created` →
 * `payment.succeeded` branch — the one that flips a pending transaction and
 * fires `after_transaction_update` → `enroll_user` → `entitlements` — had no
 * route-level test at all, for ANY provider.
 *
 * WHY LEMON SQUEEZY. It is the only rail where a webhook can be VERIFIED with
 * no credential of theirs: the webhook secret is OURS, not theirs
 * (`lib/payments/lemonsqueezy-provider.ts` HMAC-SHA256s the raw body and hex
 * compares it against `x-signature`), so a correctly signed body can be built
 * inside the spec. Stripe needs a CLI session, PayPal verifies with a live API
 * call, Binance needs merchant keys. `LEMONSQUEEZY_API_KEY` and
 * `LEMONSQUEEZY_STORE_ID` are still needed, but only as constructor arguments:
 * `getPaymentProvider('lemonsqueezy')` (lib/payments/index.ts:79-88) refuses to
 * build the adapter without all three, and the route turns that throw into a
 * 503 — hence the three-var skip gate below. Any value works; verification
 * never touches them (ci.yml passes synthetic ones).
 *
 * WHAT IS SYNTHETIC AND WHAT IS REAL. The payload is synthetic — Lemon Squeezy
 * cannot deliver to `lvh.me`, and the fixture is written from the attributes
 * the adapter actually reads (`meta.event_name`, `meta.custom_data.*`,
 * `data.id`, `data.attributes.updated_at`, `data.attributes.refunded_amount`).
 * Everything downstream of the bytes is the shipping code: the signature check,
 * `normalizeWebhookEvent`, the `webhook_events` claim/complete lease,
 * `dispatchBillingEvent`, the Postgres `after_transaction_update` trigger,
 * `enroll_user`, and `apply_webhook_refund`. What this file deliberately does
 * NOT prove is that Lemon Squeezy's live payload still looks like this fixture
 * — only a sandbox store proves that.
 *
 * THE FIXTURE IS SPEC-OWNED, not seeded. The obvious pair (alice + product
 * 2001) looks free but `supabase/seed.sql:530` already grants her the
 * product-2001 entitlement, so a purchase there would only exercise
 * `enroll_user`'s ON CONFLICT DO UPDATE branch and cleanup would delete a
 * seeded row. Instead this spec owns a tenant (`qa-ls-webhook`), its course,
 * two products and their `product_courses` rows, so the entitlement is proven
 * to be CREATED, and teardown is a delete-by-tenant_id.
 *
 * TWO BEHAVIOURS ASSERTED HERE COME FROM THE DISPATCHER, NOT FROM INTUITION:
 *   - Buyer binding EXISTS and fails CLOSED — on activation AND refund. The
 *     dispatcher throws `metadata owner mismatch` unless `meta.custom_data.userId`
 *     and `.tenantId` both match the transaction row — so a mismatched event is
 *     a 500 (the provider retries), not a silent 200, and nothing moves. Refunds
 *     used to match on `event.reference` (a sequential transaction id) alone, so
 *     one signed `order_refunded` could void another school's sale (#743).
 *   - A PARTIAL refund keeps the sale (#547). `apply_webhook_refund` only flips
 *     the status to `refunded` (and revokes entitlements) when the cumulative
 *     refund reaches `amount - 0.005`; below that the row stays `successful`
 *     with the slice in `refunded_amount`, in MAJOR units of its own currency
 *     (Lemon Squeezy reports cents; the adapter divides by 100).
 *
 * ORDERING. Serial and desktop-only — each test builds on the previous one's DB
 * state. The buyer-binding case gets its OWN pending transaction on a SECOND
 * product rather than reusing the settled one: `transactions_unique_product`
 * allows only one live row per (user, product), and after test 2 the shared row
 * is no longer `pending`, so "stays pending" would be unassertable on it.
 */
import { createHmac } from 'node:crypto'
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
  id: '00000000-0000-0000-0000-000000000301',
  slug: 'qa-ls-webhook',
  name: 'QA Lemon Squeezy Webhook',
  // No throwaway platform plan — the tenant stays on `free`. `destroyQaTenant`
  // deletes by this slug, which simply matches nothing.
  planSlug: 'e2e-ls-no-plan',
}

const PROVIDER = 'lemonsqueezy'
const WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
/**
 * All three or nothing: `getPaymentProvider('lemonsqueezy')` throws without the
 * API key and store id too, and the route answers 503 `Provider not configured`
 * — so gating on the secret alone turns a half-configured machine into five
 * failures ("expected 400, received 503") instead of a skip.
 */
const LS_READY = Boolean(
  WEBHOOK_SECRET && process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID,
)
/**
 * The ROOT host, not `qa-ls-webhook.lvh.me`. Nothing downstream reads tenant
 * context — proxy.ts short-circuits `/api` before every tenant guard, and the
 * route finds the row by `event.reference` with a service-role client — while a
 * subdomain would make Playwright's NODE-side APIRequestContext resolve it by
 * real DNS. `--host-resolver-rules` in playwright.config.ts is a chromium
 * launch arg and does not apply here, and CI's hosts step pins only `lvh.me`,
 * `default.lvh.me` and `code-academy.lvh.me`.
 */
const WEBHOOK_URL = `${BASE}/api/payments/webhook/${PROVIDER}`

const RUN = Date.now()
/** Every synthesised order id carries this so teardown can LIKE-match a crashed run's ledger rows. */
const ORDER_PREFIX = `ls-e2e-order-${RUN}`
const SALE_AMOUNT = 49
const REFUND_SLICE = 10

/** Lemon Squeezy has no native event id; the adapter synthesises this exact key. */
const lsEventId = (eventName: string, orderId: string, updatedAt: string) =>
  `${eventName}:${orderId}:${updatedAt}`

const SETTLE_ORDER = `${ORDER_PREFIX}-settle`
const SETTLE_UPDATED_AT = '2026-09-14T10:00:00.000Z'
const BINDING_ORDER = `${ORDER_PREFIX}-binding`
const BINDING_UPDATED_AT = '2026-09-14T10:05:00.000Z'
const BADSIG_ORDER = `${ORDER_PREFIX}-badsig`
const BADSIG_UPDATED_AT = '2026-09-14T09:55:00.000Z'
const REFUND_UPDATED_AT = '2026-09-14T11:00:00.000Z'

const SETTLE_EVENT_ID = lsEventId('order_created', SETTLE_ORDER, SETTLE_UPDATED_AT)
const BINDING_EVENT_ID = lsEventId('order_created', BINDING_ORDER, BINDING_UPDATED_AT)
const BADSIG_EVENT_ID = lsEventId('order_created', BADSIG_ORDER, BADSIG_UPDATED_AT)
const REFUND_EVENT_ID = lsEventId('order_refunded', SETTLE_ORDER, REFUND_UPDATED_AT)

// ---------------------------------------------------------------------------
// Payload + signature. The signature is over BYTES: build the raw string once,
// HMAC that string, and hand Playwright that same string as `data`. Passing an
// object would let Playwright re-serialise it and every signature would 400.
// ---------------------------------------------------------------------------

/** HMAC-SHA256 hex over the raw body — the whole of what `verifyWebhook` checks. */
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

interface CustomData {
  reference: string
  userId: string
  tenantId: string
  productId: string
}

/**
 * `order_created` — a one-time purchase. The adapter reads only
 * `meta.event_name`, `meta.custom_data`, `data.id` and
 * `data.attributes.updated_at`; the rest mirrors a real payload so the fixture
 * stays recognisable. `custom_data` is what the checkout route wrote into
 * `checkout_data.custom` (app/api/payments/checkout/route.ts:364-371).
 */
function orderCreated(opts: { orderId: string; updatedAt: string; custom: CustomData }): string {
  return JSON.stringify({
    meta: { event_name: 'order_created', custom_data: opts.custom },
    data: {
      type: 'orders',
      id: opts.orderId,
      attributes: {
        identifier: `ls-ident-${opts.orderId}`,
        status: 'paid',
        currency: 'USD',
        total: SALE_AMOUNT * 100,
        refunded: false,
        created_at: opts.updatedAt,
        updated_at: opts.updatedAt,
      },
    },
  })
}

/**
 * `order_refunded`. Lemon Squeezy states every money field in CENTS; the
 * adapter divides by 100 and lowercases the currency, so `refunded_amount:
 * 1000` on a $49 sale is the $10 PARTIAL slice — putting dollars here instead
 * would be 100x too big and `least(amount, …)` would silently make it a FULL
 * refund.
 */
function orderRefunded(opts: {
  orderId: string
  updatedAt: string
  refundedCents: number
  custom: CustomData
}): string {
  return JSON.stringify({
    meta: { event_name: 'order_refunded', custom_data: opts.custom },
    data: {
      type: 'orders',
      id: opts.orderId,
      attributes: {
        identifier: `ls-ident-${opts.orderId}`,
        status: 'refunded',
        currency: 'USD',
        total: SALE_AMOUNT * 100,
        refunded: true,
        refunded_amount: opts.refundedCents,
        created_at: opts.updatedAt,
        updated_at: opts.updatedAt,
      },
    },
  })
}

async function postWebhook(request: APIRequestContext, body: string, signature: string) {
  return request.post(WEBHOOK_URL, {
    headers: { 'content-type': 'application/json', 'x-signature': signature },
    data: body,
  })
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
  const { data, error } = await admin.from('product_courses').select('course_id').eq('product_id', productId)
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

/**
 * Everything this spec creates, children before parents. Safe on a clean
 * database. Every delete is checked: this also runs FIRST in `beforeAll` — it
 * is what makes a second run safe after a crash — so a silently failing delete
 * (a future FK, an RLS change on the service-role path) must surface here and
 * not as a baffling assertion failure three tests later.
 */
async function teardown() {
  const admin = getAdmin()
  const wipe = async (what: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run
    if (error) throw new Error(`teardown could not clear ${what}: ${error.message}`)
  }

  await wipe(
    'webhook_business_effects',
    admin.from('webhook_business_effects').delete().eq('provider', PROVIDER).like('provider_event_id', '%ls-e2e-order-%'),
  )
  await wipe(
    'webhook_events',
    admin.from('webhook_events').delete().eq('provider', PROVIDER).like('provider_event_id', '%ls-e2e-order-%'),
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

test.describe('Lemon Squeezy — a signed order settles and grants access (#740)', () => {
  test.skip(
    !LS_READY,
    'LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_WEBHOOK_SECRET are required',
  )

  let courseId: number
  let productId: number
  let bindingProductId: number
  let transactionId: number
  let bindingTransactionId: number
  let settleCustom: CustomData
  let bindingCustom: CustomData

  test.beforeAll(async () => {
    const admin = getAdmin()
    await teardown() // a crashed previous run must not poison this one

    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    courseId = await insertCourse(admin, QA.id, `LS Webhook Course ${RUN}`, { status: 'published' })

    const insertProduct = async (name: string): Promise<number> => {
      const { data, error } = await admin
        .from('products')
        .insert({
          name,
          description: 'Lemon Squeezy webhook settlement fixture',
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
      const { error: mapError } = await admin
        .from('product_courses')
        .insert({ product_id: id, course_id: courseId, tenant_id: QA.id })
      if (mapError) throw new Error(`could not map product ${id} to course ${courseId}: ${mapError.message}`)
      return id
    }

    productId = await insertProduct(`LS Settlement Bundle ${RUN}`)
    bindingProductId = await insertProduct(`LS Binding Bundle ${RUN}`)

    // `authenticated` has no INSERT grant on transactions (#538) — every row is
    // service-role. Seeded `pending`: an inserted `successful` row would fire
    // the same trigger and we could not tell the webhook from the insert.
    //
    // Seeded with a DIFFERENT provider on purpose. The dispatcher's settle write
    // is `update({ status: 'successful', payment_provider: provider })`
    // (webhook-dispatch.ts:526); seeding `lemonsqueezy` would make the
    // payment_provider assertion pass for the wrong reason — it would keep
    // passing if that key were dropped from the update. `transactions` has no
    // payment_provider CHECK (only products/plans do), and although changing the
    // column fires `before_transaction_split_snapshot_update`, this row's
    // `school_percentage_snapshot` is already non-NULL from the INSERT branch,
    // so the function just restores OLD and changes nothing else.
    const SEEDED_PROVIDER = 'manual'
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
          payment_provider: SEEDED_PROVIDER,
        })
        .select('transaction_id')
        .single()
      if (error) throw new Error(`could not seed transaction for product ${product}: ${error.message}`)
      return data.transaction_id as number
    }

    transactionId = await seedPending(productId)
    bindingTransactionId = await seedPending(bindingProductId)

    settleCustom = {
      reference: String(transactionId),
      userId: SEEDED.student.id,
      tenantId: QA.id,
      productId: String(productId),
    }
    // Correctly signed, correct tenant — but names the WRONG buyer.
    bindingCustom = {
      reference: String(bindingTransactionId),
      userId: SEEDED.owner.id,
      tenantId: QA.id,
      productId: String(bindingProductId),
    }
  })

  test.afterAll(async () => {
    await teardown()
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!['desktop-chromium', 'human'].includes(testInfo.project.name), 'runs once — DB state is shared')
    // Locally the webServer is `next dev`, and the first POST below is this
    // suite's first hit on /api/payments/webhook/[provider] — it pays
    // Turbopack's on-demand compile of that route inside the test budget. The
    // shared 30 s (playwright.config.ts:50) is not enough for a cold server; CI
    // runs `next start` on a prebuilt app and never spends it.
    testInfo.setTimeout(120_000)
  })

  test('a body signed with the wrong secret is refused and writes nothing', async ({ request }) => {
    const admin = getAdmin()
    const body = orderCreated({
      orderId: BADSIG_ORDER,
      updatedAt: BADSIG_UPDATED_AT,
      custom: { ...settleCustom },
    })

    const res = await postWebhook(request, body, sign(body, `${WEBHOOK_SECRET}x`))
    expect(res.status(), await res.text()).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid signature' })

    // LOAD-BEARING: verification runs BEFORE the claim, so the ledger must be
    // untouched. This is the only line here that proves anything — at this point
    // nothing has run yet, so the two below are true before the request too.
    // Keep them as a tripwire for a future reorder, but never delete this one.
    expect(await ledgerRows(admin, BADSIG_EVENT_ID)).toHaveLength(0)

    const tx = await readTransaction(admin, transactionId)
    expect(tx.status).toBe('pending')
    expect(await entitlementsOf(admin, SEEDED.student.id, productId)).toHaveLength(0)
  })

  test('a signed order_created settles the transaction and grants every mapped course', async ({ request }) => {
    const admin = getAdmin()
    const courses = await coursesOf(admin, productId)
    expect(courses).toEqual([courseId])

    const body = orderCreated({
      orderId: SETTLE_ORDER,
      updatedAt: SETTLE_UPDATED_AT,
      custom: settleCustom,
    })
    const res = await postWebhook(request, body, sign(body, WEBHOOK_SECRET!))
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, eventStatus: 'accepted' })

    // The dispatcher's only write. A 200 alone proves nothing: four of the five
    // ways payment.succeeded fails are silent 200s.
    const tx = await readTransaction(admin, transactionId)
    expect(tx.status).toBe('successful')
    // Seeded 'manual' — this is the other half of that one update statement.
    expect(tx.payment_provider).toBe(PROVIDER)
    expect(Number(tx.refunded_amount)).toBe(0)

    // Everything below is Postgres: after_transaction_update → enroll_user.
    const grants = await entitlementsOf(admin, SEEDED.student.id, productId)
    expect(grants).toHaveLength(courses.length)
    for (const course of courses) {
      expect(grants).toContainEqual(
        expect.objectContaining({
          course_id: course,
          // enroll_user takes the tenant from product_courses, not the transaction.
          tenant_id: QA.id,
          source_type: 'product',
          source_id: productId,
          status: 'active',
          revoked_at: null,
        }),
      )
    }

    const { data: enrollments, error: enrollmentsError } = await admin
      .from('enrollments')
      .select('course_id, status')
      .eq('user_id', SEEDED.student.id)
      .eq('tenant_id', QA.id)
      .order('course_id')
    if (enrollmentsError) throw new Error(`could not read enrollments: ${enrollmentsError.message}`)
    expect(enrollments).toEqual(courses.map((course) => ({ course_id: course, status: 'active' })))

    const ledger = await ledgerRows(admin, SETTLE_EVENT_ID)
    expect(ledger).toHaveLength(1)
    // attempt_count 1 = claimed once. It is also how a redelivery would show up
    // in the ledger, which is what the next test pins.
    expect(ledger[0]).toMatchObject({ event_type: 'payment.succeeded', error: null, attempt_count: 1 })
    expect(ledger[0].processed_at).not.toBeNull()
  })

  test('replaying the identical signed body is acked as a duplicate and grants nothing twice', async ({
    request,
  }) => {
    const admin = getAdmin()
    const body = orderCreated({
      orderId: SETTLE_ORDER,
      updatedAt: SETTLE_UPDATED_AT,
      custom: settleCustom,
    })
    const res = await postWebhook(request, body, sign(body, WEBHOOK_SECRET!))
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

    const tx = await readTransaction(admin, transactionId)
    expect(tx.status).toBe('successful')
    expect(Number(tx.refunded_amount)).toBe(0)

    const grants = await entitlementsOf(admin, SEEDED.student.id, productId)
    expect(grants).toHaveLength((await coursesOf(admin, productId)).length)
    expect(grants.every((row) => row.status === 'active')).toBe(true)

    const { count } = await admin
      .from('transactions')
      .select('transaction_id', { count: 'exact', head: true })
      .eq('tenant_id', QA.id)
      .eq('product_id', productId)
      .eq('status', 'successful')
    expect(count).toBe(1)
  })

  test('a signed event naming a different buyer refuses to settle the transaction', async ({ request }) => {
    const admin = getAdmin()
    const body = orderCreated({
      orderId: BINDING_ORDER,
      updatedAt: BINDING_UPDATED_AT,
      custom: bindingCustom, // correct tenant, WRONG userId
    })
    const res = await postWebhook(request, body, sign(body, WEBHOOK_SECRET!))

    // The owner check fails CLOSED: dispatchBillingEvent throws, so the route
    // releases the claim and 500s (the provider retries) rather than acking.
    expect(res.status(), await res.text()).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Dispatch failed' })

    const tx = await readTransaction(admin, bindingTransactionId)
    expect(tx.status).toBe('pending')
    expect(await entitlementsOf(admin, SEEDED.student.id, bindingProductId)).toHaveLength(0)

    const ledger = await ledgerRows(admin, BINDING_EVENT_ID)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].processed_at).toBeNull()
    expect(ledger[0].error).toContain('owner mismatch')
    // Claimed once and RELEASED, not re-claimed: `fail_webhook_event` clears the
    // lease without bumping the counter, so the provider's retry can claim it.
    expect(ledger[0].attempt_count).toBe(1)
  })

  test('a signed order_refunded naming a different buyer voids nothing (#743)', async ({ request }) => {
    const admin = getAdmin()
    const updatedAt = '2026-09-14T10:30:00.000Z'
    const eventId = lsEventId('order_refunded', SETTLE_ORDER, updatedAt)
    const body = orderRefunded({
      orderId: SETTLE_ORDER,
      updatedAt,
      // A FULL refund — the case that would also revoke the student's access.
      refundedCents: SALE_AMOUNT * 100,
      // The SETTLED sale's reference, the right tenant, the WRONG buyer.
      custom: { ...settleCustom, userId: SEEDED.owner.id },
    })
    const res = await postWebhook(request, body, sign(body, WEBHOOK_SECRET!))

    expect(res.status(), await res.text()).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Dispatch failed' })

    const tx = await readTransaction(admin, transactionId)
    expect(tx.status).toBe('successful')
    expect(Number(tx.refunded_amount)).toBe(0)
    const grants = await entitlementsOf(admin, SEEDED.student.id, productId)
    expect(grants).toHaveLength((await coursesOf(admin, productId)).length)
    for (const grant of grants) expect(grant.status).toBe('active')

    const ledger = await ledgerRows(admin, eventId)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].processed_at).toBeNull()
    expect(ledger[0].error).toContain('owner mismatch')
  })

  test('a partial order_refunded records the slice and keeps the sale and the access', async ({ request }) => {
    const admin = getAdmin()
    const body = orderRefunded({
      orderId: SETTLE_ORDER,
      updatedAt: REFUND_UPDATED_AT,
      refundedCents: REFUND_SLICE * 100, // Lemon Squeezy speaks CENTS
      custom: settleCustom,
    })
    const res = await postWebhook(request, body, sign(body, WEBHOOK_SECRET!))
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, eventStatus: 'accepted' })

    // $10 off a $49 sale is nowhere near `amount - 0.005`, so the sale stands
    // and only the slice is recorded — in MAJOR units of the row's own currency.
    // LOAD-BEARING: `refunded_amount` is the only line here that a no-op
    // `apply_webhook_refund` would fail. The row was already `successful` with
    // active grants when test 2 ended, so "keeps the sale" rests on this
    // assertion plus the business-effects row below — do not delete either and
    // keep the unchanged-state assertions.
    const tx = await readTransaction(admin, transactionId)
    expect(Number(tx.refunded_amount)).toBeCloseTo(REFUND_SLICE, 2)
    expect(tx.status).toBe('successful')
    expect(Number(tx.amount)).toBeCloseTo(SALE_AMOUNT, 2)

    // Revocation is gated on status = 'refunded'; a partial must not revoke.
    const grants = await entitlementsOf(admin, SEEDED.student.id, productId)
    expect(grants).toHaveLength((await coursesOf(admin, productId)).length)
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
    expect(effects).toEqual([{ effect_type: 'refund', target_id: String(transactionId) }])

    const ledger = await ledgerRows(admin, REFUND_EVENT_ID)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ event_type: 'refund.succeeded', error: null })
    expect(ledger[0].processed_at).not.toBeNull()
  })
})
