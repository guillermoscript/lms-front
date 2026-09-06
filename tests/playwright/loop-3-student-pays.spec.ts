/**
 * Loop 3 — a student pays the school with Stripe (test mode) and the school
 * sees the money. Issue #672, part of the MVP acceptance epic #682.
 *
 * What is real here and what is synthetic, and why:
 *
 * - The card half is REAL. The repo's `sk_test_` key has Stripe Connect enabled
 *   and `E2E_STRIPE_CONNECT_ACCOUNT` names a connected account with
 *   `charges_enabled: true`, so `/api/stripe/create-payment-intent` builds a
 *   genuine destination charge (`transfer_data.destination` + the platform
 *   fee), the PaymentElement takes `4242 4242 4242 4242`, and Stripe moves
 *   test-mode money. The spec then reads the PaymentIntent / Subscription back
 *   from Stripe to prove the charge, the fee and the destination.
 * - The webhook half is SYNTHETIC but signed. Stripe cannot deliver to
 *   `lvh.me`, so the spec signs `payment_intent.succeeded`,
 *   `invoice.payment_succeeded` and `payout.paid` with `STRIPE_WEBHOOK_SECRET`
 *   (the same HMAC recipe `platform-billing-stripe-webhook.spec.ts` uses) and
 *   POSTs them carrying the REAL ids Stripe just created. Everything after the
 *   signature check — idempotency, the `after_transaction_update` trigger,
 *   `enroll_user` / `handle_new_subscription`, `entitlements` — runs for real.
 * - Money figures are asserted against the `transactions` / `payouts` rows the
 *   pages render from, never against the price the test typed.
 *
 * The spec owns a dedicated tenant (`qa-loop3-pays`) so the seeded Default /
 * Code Academy tenants keep their Connect state, and a 20/80 `revenue_splits`
 * row so the fee arithmetic is explicit rather than whatever the plan defaults
 * to. Serial and desktop-only: every test builds on the previous one's DB state.
 */
import { createHmac } from 'node:crypto'
import { expect, test, type APIRequestContext, type Frame, type Page } from '@playwright/test'
import { BASE, LOCALE } from './utils/constants'
import { login } from './utils/auth'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  tenantBase,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000300',
  slug: 'qa-loop3-pays',
  name: 'QA Loop 3 Pays',
  // No throwaway platform plan for this spec — the tenant stays on `free`.
  // `destroyQaTenant` deletes by this slug, which simply matches nothing.
  planSlug: 'e2e-loop3-no-plan',
}
const QA_BASE = tenantBase(QA.slug)

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? ''
const REAL_STRIPE_KEY = STRIPE_KEY.startsWith('sk_test_') && !STRIPE_KEY.includes('synthetic')
const CONNECT_ACCOUNT = process.env.E2E_STRIPE_CONNECT_ACCOUNT ?? ''
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''
const WEBHOOK_URL = `${QA_BASE}/api/stripe/webhook`

const PLATFORM_PERCENTAGE = 20
const SCHOOL_PERCENTAGE = 100 - PLATFORM_PERCENTAGE
const PRODUCT_PRICE = 50
const PLAN_PRICE = 20

const RUN = Date.now()
const COURSE_TITLE = `Loop 3 Paid Course ${RUN}`
const PLAN_NAME = `Loop 3 Monthly ${RUN}`

/** The same figure the pages print: `formatCurrency` / `formatMoney` are both Intl currency in `en`. */
const usd = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
const round2 = (n: number) => Math.round(n * 100) / 100

function sign(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

/** A Stripe event envelope around `object`; `account` marks it as a Connect event. */
function stripeEvent(type: string, object: Record<string, unknown>, account?: string): string {
  return JSON.stringify({
    id: `evt_e2e_${type.replace(/\./g, '_')}_${Date.now()}`,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
    ...(account ? { account } : {}),
  })
}

async function postSignedEvent(request: APIRequestContext, payload: string) {
  return request.post(WEBHOOK_URL, {
    headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload, WEBHOOK_SECRET) },
    data: payload,
  })
}

/** Read an object back from Stripe with the test key — the proof the money moved. */
type StripeObject = {
  status?: string
  amount?: number
  application_fee_amount?: number
  application_fee_percent?: number | string
  transfer_data?: { destination?: string }
  metadata?: Record<string, string>
}

async function stripeGet(request: APIRequestContext, path: string): Promise<StripeObject> {
  const res = await request.get(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${STRIPE_KEY}` },
  })
  const body = await res.json()
  if (!res.ok()) throw new Error(`Stripe GET ${path} → ${res.status()}: ${JSON.stringify(body.error ?? body)}`)
  return body
}

async function stripeDelete(request: APIRequestContext, path: string) {
  await request.delete(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${STRIPE_KEY}` },
  })
}

/**
 * Stripe's PaymentElement renders the card inputs inside one of several
 * `__privateStripeFrame` iframes whose titles vary by release, so the frame is
 * found by content: whichever one holds the card-number input.
 */
async function paymentFrame(page: Page): Promise<Frame> {
  const find = async () => {
    for (const frame of page.frames()) {
      if ((await frame.locator('input[name="number"]').count().catch(() => 0)) > 0) return frame
    }
    return null
  }
  await expect.poll(async () => (await find()) !== null, { timeout: 90_000, intervals: [500, 1000] }).toBe(true)
  return (await find())!
}

/**
 * Type the test card into the PaymentElement and press Pay.
 *
 * The Pay control is a base-ui Button whose click intermittently lands without
 * firing the handler (see `utils/auth.ts`), so it is re-pressed until the page
 * leaves checkout. The locator is anchored on the price so the dev-only
 * "Pay & Enroll (Test)" shortcut below the form can never be picked instead.
 */
async function payWithTestCard(page: Page) {
  const frame = await paymentFrame(page)
  const number = frame.locator('input[name="number"]')
  await expect(number).toBeVisible({ timeout: 30_000 })
  await number.fill('4242424242424242')
  await frame.locator('input[name="expiry"]').fill('12 / 34')
  await frame.locator('input[name="cvc"]').fill('123')
  const postal = frame.locator('input[name="postalCode"]')
  if (await postal.isVisible({ timeout: 1_000 }).catch(() => false)) await postal.fill('12345')

  const pay = page.getByRole('button', { name: /^pay \$/i })
  await expect(pay).toBeEnabled({ timeout: 15_000 })
  for (let attempt = 0; attempt < 3 && !page.url().includes('/checkout/success'); attempt++) {
    await pay.click().catch(() => undefined)
    await page
      .waitForURL('**/checkout/success**', { timeout: 60_000, waitUntil: 'commit' })
      .catch(() => undefined)
  }
  expect(page.url(), 'Stripe should have redirected to the return_url').toContain('/checkout/success')
}

/** `transactionId` from our return_url plus the `payment_intent` Stripe appends to it. */
function parseSuccessUrl(url: string) {
  const u = new URL(url)
  return {
    transactionId: Number(u.searchParams.get('transactionId')),
    paymentIntentId: u.searchParams.get('payment_intent'),
    redirectStatus: u.searchParams.get('redirect_status'),
  }
}

/** Everything this spec creates, oldest dependency last. Safe on a clean database. */
async function teardown() {
  const admin = getAdmin()
  const { data: plans } = await admin.from('plans').select('plan_id').eq('tenant_id', QA.id)
  const planIds = (plans ?? []).map((p) => p.plan_id as number)

  await admin.from('entitlements').delete().eq('tenant_id', QA.id)
  await admin.from('subscriptions').delete().eq('tenant_id', QA.id)
  await admin.from('transactions').delete().eq('tenant_id', QA.id)
  await admin.from('payouts').delete().eq('tenant_id', QA.id)
  if (planIds.length) await admin.from('plan_courses').delete().in('plan_id', planIds)
  await admin.from('plans').delete().eq('tenant_id', QA.id)
  await admin.from('product_courses').delete().eq('tenant_id', QA.id)
  await admin.from('products').delete().eq('tenant_id', QA.id)
  await destroyQaTenant(admin, QA)
}

test.describe('Loop 3 — a student pays the school with Stripe and the school sees the money (#672)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    !REAL_STRIPE_KEY || !CONNECT_ACCOUNT || !WEBHOOK_SECRET,
    'A real sk_test STRIPE_SECRET_KEY, E2E_STRIPE_CONNECT_ACCOUNT and STRIPE_WEBHOOK_SECRET are required',
  )

  let courseId: number
  let productId: number
  let productTransactionId: number
  let productPaymentIntentId: string
  let planId: number
  let planTransactionId: number
  let stripeSubscriptionId: string | null = null
  let studentCustomerIdBefore: string | null = null

  test.beforeAll(async () => {
    const admin = getAdmin()
    await teardown()
    await createQaTenant(admin, QA, 'free')

    // Explicit 20/80 so the fee maths below is the spec's, not the plan's.
    const { error: splitError } = await admin
      .from('revenue_splits')
      .upsert(
        { tenant_id: QA.id, platform_percentage: PLATFORM_PERCENTAGE, school_percentage: SCHOOL_PERCENTAGE },
        { onConflict: 'tenant_id' },
      )
    if (splitError) throw new Error(`revenue_splits: ${splitError.message}`)

    // A school that finished Connect onboarding: the #606 gate reads exactly these.
    const { error: connectError } = await admin
      .from('tenants')
      .update({ stripe_account_id: CONNECT_ACCOUNT, stripe_charges_enabled: true, stripe_details_submitted: true })
      .eq('id', QA.id)
    if (connectError) throw new Error(`tenants connect state: ${connectError.message}`)

    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    courseId = await insertCourse(admin, QA.id, COURSE_TITLE, { status: 'published' })

    // `profiles` is global: checkout writes a Stripe customer id onto the seeded
    // student, so remember what was there to put it back.
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', SEEDED.student.id)
      .single()
    studentCustomerIdBefore = (profile?.stripe_customer_id as string | null) ?? null
  })

  test.afterAll(async ({ request }) => {
    if (stripeSubscriptionId) await stripeDelete(request, `subscriptions/${stripeSubscriptionId}`).catch(() => undefined)
    await getAdmin()
      .from('profiles')
      .update({ stripe_customer_id: studentCustomerIdBefore })
      .eq('id', SEEDED.student.id)
    await teardown()
  })

  test.beforeEach(async ({}, testInfo) => {
    // `human` is the slowMo + video project used to record the QA GIF locally.
    test.skip(
      !['desktop-chromium', 'human'].includes(testInfo.project.name),
      'runs once — DB state is shared and Stripe is charged for real',
    )
    // Real Stripe round-trips plus a cold dev server: the shared 30 s budget is not enough.
    testInfo.setTimeout(600_000)
  })

  test('the admin publishes a Stripe-priced product for the course', async ({ page }) => {
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/products/new`, { waitUntil: 'domcontentloaded' })

    const next = page.getByTestId('product-creation-next')

    // Step 1 — reuse the fixture course (it has no product yet, so it is offered).
    await page.getByTestId('course-source-existing').click()
    await page.getByTestId('existing-course-select').click()
    await page.getByRole('option', { name: COURSE_TITLE }).click()
    await next.click()

    // Step 2 — basics are mirrored from the course.
    await next.click()

    // Step 3 — paid, USD, Stripe.
    await page.getByTestId('pricing-mode-paid').getByRole('radio').first().click()
    const price = page.getByTestId('product-creation-price')
    await expect(price).toBeVisible({ timeout: 10_000 })
    await price.fill(String(PRODUCT_PRICE))
    await page.getByTestId('product-creation-payment-provider').click()
    await page.getByRole('option', { name: /stripe/i }).first().click()

    // Steps 4 and 5 — nothing to add after purchase; publish from the review step.
    const publish = page.getByTestId('product-creation-publish')
    for (let step = 0; step < 4; step++) {
      if (await publish.isVisible({ timeout: 1_000 }).catch(() => false)) break
      await next.click()
    }
    await expect(publish).toBeEnabled({ timeout: 10_000 })
    await publish.click()
    await expect(page.getByTestId('products-page')).toBeVisible({ timeout: 60_000 })

    // The wizard went through `createProduct`: readiness gate + real Stripe catalog objects.
    const { data: product } = await getAdmin()
      .from('products')
      .select('product_id, price, currency, payment_provider, provider_product_id, provider_price_id, status')
      .eq('tenant_id', QA.id)
      .single()
    expect(product, 'wizard should have inserted exactly one product').toBeTruthy()
    productId = product!.product_id as number
    expect(Number(product!.price)).toBe(PRODUCT_PRICE)
    expect(product!.payment_provider).toBe('stripe')
    expect(product!.provider_product_id).toMatch(/^prod_/)
    expect(product!.provider_price_id).toMatch(/^price_/)

    const { data: link } = await getAdmin()
      .from('product_courses')
      .select('course_id')
      .eq('product_id', productId)
      .eq('tenant_id', QA.id)
    expect((link ?? []).map((l) => l.course_id)).toEqual([courseId])
  })

  test('the student pays with the 4242 test card and Stripe takes the platform fee', async ({ page, request }) => {
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/checkout?courseId=${courseId}`, { waitUntil: 'domcontentloaded' })

    await payWithTestCard(page)
    const { transactionId, paymentIntentId, redirectStatus } = parseSuccessUrl(page.url())
    expect(redirectStatus).toBe('succeeded')
    expect(paymentIntentId).toMatch(/^pi_/)
    productTransactionId = transactionId
    productPaymentIntentId = paymentIntentId!

    // No webhook yet: the row is still pending and the page says so instead of lying.
    const { data: tx } = await getAdmin()
      .from('transactions')
      .select('status, amount, currency, product_id, stripe_payment_intent_id, payment_provider, school_percentage_snapshot')
      .eq('transaction_id', transactionId)
      .single()
    expect(tx?.status).toBe('pending')
    expect(tx?.product_id).toBe(productId)
    expect(Number(tx?.amount)).toBe(PRODUCT_PRICE)
    expect(tx?.stripe_payment_intent_id).toBe(paymentIntentId)
    expect(Number(tx?.school_percentage_snapshot)).toBe(SCHOOL_PERCENTAGE)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
    expect(page.url()).toContain('/checkout/success')

    // Stripe's side of the ledger: the charge succeeded, the fee is the platform's cut, the rest is routed to the school.
    const intent = await stripeGet(request, `payment_intents/${paymentIntentId}`)
    expect(intent.status).toBe('succeeded')
    expect(intent.amount).toBe(PRODUCT_PRICE * 100)
    expect(intent.application_fee_amount).toBe(Math.round((PRODUCT_PRICE * 100 * PLATFORM_PERCENTAGE) / 100))
    expect(intent.transfer_data?.destination).toBe(CONNECT_ACCOUNT)
    expect(intent.metadata?.transactionId).toBe(String(transactionId))
  })

  test('the signed payment_intent.succeeded webhook settles the sale and grants course access', async ({ page, request }) => {
    const payload = stripeEvent('payment_intent.succeeded', {
      id: productPaymentIntentId,
      object: 'payment_intent',
      amount: PRODUCT_PRICE * 100,
      currency: 'usd',
      status: 'succeeded',
      metadata: {
        transactionId: String(productTransactionId),
        userId: SEEDED.student.id,
        tenantId: QA.id,
        planId: '',
        productId: String(productId),
      },
    })

    const res = await postSignedEvent(request, payload)
    expect(res.status()).toBe(200)

    const admin = getAdmin()
    const { data: tx } = await admin
      .from('transactions')
      .select('status, school_percentage_snapshot')
      .eq('transaction_id', productTransactionId)
      .single()
    expect(tx?.status).toBe('successful')
    expect(Number(tx?.school_percentage_snapshot)).toBe(SCHOOL_PERCENTAGE)

    const entitlementsOf = async () =>
      (
        await admin
          .from('entitlements')
          .select('course_id, source_type, source_id, status')
          .eq('user_id', SEEDED.student.id)
          .eq('tenant_id', QA.id)
          .eq('course_id', courseId)
      ).data ?? []
    const granted = await entitlementsOf()
    expect(granted).toEqual([{ course_id: courseId, source_type: 'product', source_id: productId, status: 'active' }])

    // Stripe retries; a redelivery must not double-grant or error.
    const replay = await postSignedEvent(request, payload)
    expect(replay.status()).toBe(200)
    expect(await entitlementsOf()).toHaveLength(1)

    // The success page now resolves to the course, and the course opens.
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/checkout/success?transactionId=${productTransactionId}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForURL(`**/dashboard/student/courses/${courseId}**`, { timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(COURSE_TITLE, { timeout: 30_000 })
  })

  test('the school sees the transaction, its net revenue, and a paid payout', async ({ page, request }) => {
    const admin = getAdmin()

    // Figures come from the rows the pages read, not from the price the test typed.
    const { data: rows } = await admin
      .from('transactions')
      .select('amount, refunded_amount, school_percentage_snapshot')
      .eq('tenant_id', QA.id)
      .eq('status', 'successful')
    expect(rows).toHaveLength(1)
    const gross = round2(rows!.reduce((sum, r) => sum + Number(r.amount) - Number(r.refunded_amount ?? 0), 0))
    const platformFee = round2(
      rows!.reduce((sum, r) => {
        const kept = Number(r.amount) - Number(r.refunded_amount ?? 0)
        return sum + kept - round2((kept * Number(r.school_percentage_snapshot)) / 100)
      }, 0),
    )
    const net = round2(gross - platformFee)
    expect(gross).toBe(PRODUCT_PRICE)
    expect(net).toBe(round2((PRODUCT_PRICE * SCHOOL_PERCENTAGE) / 100))

    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/transactions`, { waitUntil: 'domcontentloaded' })
    const transactions = page.getByTestId('transactions-page')
    await expect(transactions).toBeVisible({ timeout: 60_000 })
    await expect(transactions.getByText(usd(gross)).first()).toBeVisible({ timeout: 15_000 })
    await expect(transactions.getByText(/^successful$/i).first()).toBeVisible()

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/revenue`, { waitUntil: 'domcontentloaded' })
    const revenue = page.getByTestId('revenue-page')
    await expect(revenue).toBeVisible({ timeout: 60_000 })
    await expect(revenue.getByText(usd(gross)).first()).toBeVisible({ timeout: 15_000 })
    await expect(revenue.getByText(usd(platformFee)).first()).toBeVisible()
    await expect(revenue.getByText(usd(net)).first()).toBeVisible()

    // Stripe pays the school out of its connected balance; `payout.paid` on the
    // Connect account marks our record paid. The pending record is what the
    // payout scheduler would have written.
    const stripePayoutId = `po_e2e_loop3_${RUN}`
    const { error: payoutError } = await admin.from('payouts').insert({
      tenant_id: QA.id,
      amount: net,
      currency: 'usd',
      status: 'pending',
      stripe_payout_id: stripePayoutId,
      payout_method: 'stripe_connect',
    })
    if (payoutError) throw new Error(`payouts insert: ${payoutError.message}`)

    const paidAt = Math.floor(Date.now() / 1000)
    const res = await postSignedEvent(
      request,
      stripeEvent(
        'payout.paid',
        { id: stripePayoutId, object: 'payout', amount: Math.round(net * 100), currency: 'usd', status: 'paid', arrival_date: paidAt },
        CONNECT_ACCOUNT,
      ),
    )
    expect(res.status()).toBe(200)

    const { data: payout } = await admin
      .from('payouts')
      .select('status, paid_at, amount')
      .eq('stripe_payout_id', stripePayoutId)
      .single()
    expect(payout?.status).toBe('paid')
    expect(payout?.paid_at).toBeTruthy()

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/payouts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('payouts-page')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('total-paid-value')).toHaveText(usd(Number(payout!.amount)), { timeout: 15_000 })
    await expect(page.getByTestId('payouts-page').getByText(usd(Number(payout!.amount))).nth(1)).toBeVisible()
  })

  test('the platform payouts page renders and owes the school nothing for a Connect sale', async ({ page }) => {
    // Cookies are per host, so the super admin signs in on the platform domain.
    await login(page, SEEDED.owner.email, SEEDED.owner.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/platform/payouts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('platform-payouts')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('payouts-metrics')).toBeVisible()

    // A destination charge lands in the school's own Stripe balance. Nothing is
    // held by the platform, so `getPayoutsOwed` must not list the tenant — a
    // row here would mean the platform is about to pay the school twice.
    const byTenant = page.getByTestId('payouts-by-tenant')
    await expect(byTenant).toBeVisible()
    await expect(byTenant.getByText(QA.name)).toHaveCount(0)
  })

  test('the admin creates a Stripe plan that covers the course', async ({ page }) => {
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/plans/new`, { waitUntil: 'domcontentloaded' })

    // Stripe is the form's default provider once the rail is enabled (it is, by
    // default); monthly and USD are the defaults too.
    await page.locator('#plan_name').fill(PLAN_NAME)
    await page.locator('#price').fill(String(PLAN_PRICE))
    await page.locator(`label[for="course-${courseId}"]`).click()
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/dashboard/admin/plans', { timeout: 60_000 })

    const { data: plan } = await getAdmin()
      .from('plans')
      .select('plan_id, price, duration_in_days, payment_provider, provider_product_id, provider_price_id')
      .eq('tenant_id', QA.id)
      .is('deleted_at', null)
      .single()
    expect(plan, 'the form should have inserted exactly one plan').toBeTruthy()
    planId = plan!.plan_id as number
    expect(Number(plan!.price)).toBe(PLAN_PRICE)
    expect(plan!.duration_in_days).toBe(30)
    expect(plan!.payment_provider).toBe('stripe')
    expect(plan!.provider_product_id).toMatch(/^prod_/)
    expect(plan!.provider_price_id).toMatch(/^price_/)

    const { data: covered } = await getAdmin().from('plan_courses').select('course_id').eq('plan_id', planId)
    expect((covered ?? []).map((c) => c.course_id)).toEqual([courseId])
  })

  test('the student subscribes with the card and Stripe opens a real subscription on the school account', async ({
    page,
    request,
  }) => {
    // The product entitlement from journey 1 must not mask the subscription grant.
    const admin = getAdmin()
    await admin.from('entitlements').delete().eq('tenant_id', QA.id).eq('user_id', SEEDED.student.id)

    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/checkout?planId=${planId}`, { waitUntil: 'domcontentloaded' })

    await payWithTestCard(page)
    const { transactionId, redirectStatus } = parseSuccessUrl(page.url())
    expect(redirectStatus).toBe('succeeded')
    planTransactionId = transactionId

    const { data: tx } = await admin
      .from('transactions')
      .select('status, amount, plan_id, provider_subscription_id, payment_provider')
      .eq('transaction_id', transactionId)
      .single()
    expect(tx?.status).toBe('pending')
    expect(tx?.plan_id).toBe(planId)
    expect(Number(tx?.amount)).toBe(PLAN_PRICE)
    expect(tx?.provider_subscription_id).toMatch(/^sub_/)
    stripeSubscriptionId = tx!.provider_subscription_id as string

    const sub = await stripeGet(request, `subscriptions/${stripeSubscriptionId}`)
    expect(sub.status).toBe('active')
    expect(sub.transfer_data?.destination).toBe(CONNECT_ACCOUNT)
    expect(Number(sub.application_fee_percent)).toBe(PLATFORM_PERCENTAGE)
    expect(sub.metadata?.transactionId).toBe(String(transactionId))
  })

  test('the signed invoice.payment_succeeded webhook activates the subscription and the student can self-enroll', async ({
    page,
    request,
  }) => {
    const payload = stripeEvent('invoice.payment_succeeded', {
      id: `in_e2e_loop3_${RUN}`,
      object: 'invoice',
      billing_reason: 'subscription_create',
      status: 'paid',
      amount_paid: PLAN_PRICE * 100,
      currency: 'usd',
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: stripeSubscriptionId,
          metadata: { transactionId: String(planTransactionId), userId: SEEDED.student.id, tenantId: QA.id, planId: String(planId) },
        },
      },
    })
    const res = await postSignedEvent(request, payload)
    expect(res.status()).toBe(200)

    const admin = getAdmin()
    const { data: tx } = await admin
      .from('transactions')
      .select('status, provider_subscription_id')
      .eq('transaction_id', planTransactionId)
      .single()
    expect(tx?.status).toBe('successful')
    expect(tx?.provider_subscription_id).toBe(stripeSubscriptionId)

    const { data: subscription } = await admin
      .from('subscriptions')
      .select('subscription_status, plan_id, end_date')
      .eq('user_id', SEEDED.student.id)
      .eq('tenant_id', QA.id)
      .single()
    expect(subscription?.subscription_status).toBe('active')
    expect(subscription?.plan_id).toBe(planId)
    expect(new Date(subscription!.end_date as string).getTime()).toBeGreaterThan(Date.now())

    const { data: entitlements } = await admin
      .from('entitlements')
      .select('course_id, source_type, status')
      .eq('user_id', SEEDED.student.id)
      .eq('tenant_id', QA.id)
    expect(entitlements).toEqual([{ course_id: courseId, source_type: 'subscription', status: 'active' }])

    // Subscriptions grant access, not enrollment: the student picks the course
    // up from Browse and it opens.
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/student/browse`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('browse-courses-page')).toBeVisible({ timeout: 60_000 })
    const courseLink = page.locator(`a[href*="/dashboard/student/courses/${courseId}"]`).first()
    await expect(courseLink).toBeVisible({ timeout: 15_000 })
    await courseLink.click()
    await page.waitForURL(`**/dashboard/student/courses/${courseId}**`, { timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(COURSE_TITLE, { timeout: 30_000 })
  })
})
