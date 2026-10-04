/**
 * An offline (`manual`) sale becomes a transaction and course access — driven
 * through the real pages, the real server actions and the real database
 * (#740/#741 follow-up).
 *
 * WHY THIS FILE EXISTS. `manual` is the rail every school starts on: no
 * provider, no webhook, no credential — a student asks, an admin says "the
 * money arrived", and the platform grants access. It is also the rail with the
 * least proof. `tests/playwright/enrollment-flows.spec.ts` walks the same
 * lifecycle by WRITING THE ROWS ITSELF with a service-role client ("simulating
 * the server action", it says), and asserts that the pages render; the unit
 * tests cover `manualTransactionPaymentMethod` and `rejectManualPayment` (the
 * PLATFORM-side request). So nothing has ever exercised
 * `createPaymentRequest` → `sendPaymentInstructions` → `confirmPaymentReceived`
 * → `completeAndEnroll`, which is where the money and the entitlements are
 * actually decided, and nothing has proven that the last of those four fires
 * `after_transaction_insert` → `enroll_user` → `entitlements`.
 *
 * NOTHING IS SIMULATED HERE. Every state change is made the way a human makes
 * it: the student submits `/checkout/manual`, the admin clicks Send
 * instructions, Confirm payment received and Complete & Enroll on
 * `/dashboard/admin/payment-requests/<id>`. The service-role client is used to
 * SEED (tenant, courses, products) and to READ BACK — never to advance the
 * flow. That is the whole point: a `payment_requests` row written by a test is
 * not evidence that the action which should have written it works.
 *
 * WHAT THE ASSERTIONS ARE ACTUALLY FOR, beyond "it worked":
 *   - The PRICE IS SERVER-DERIVED. The student's form posts a phone number and
 *     a message — no amount, no currency, no product price. `payment_amount`
 *     has to come from the `products` row, and `completeAndEnroll` copies it
 *     onto the transaction. `transactions` is server-write-only (#538) and its
 *     amount decides what the school is owed, so a rail where the buyer's
 *     browser could name the price would be the whole lockdown undone.
 *   - The IDENTITY IS SERVER-DERIVED. `contact_name`/`contact_email` are read
 *     from the session and the profile, never from the client's fields.
 *   - A $0 PRODUCT NEVER REACHES THE FORM (#727, #749). A free offering is
 *     stored as price 0 with provider `manual` (the wizard's NOT NULL default),
 *     so without the guard every free course would mint an unpayable request.
 *   - The TENANT FILTER HOLDS on the request detail page: another school's
 *     admin gets bounced, not a form that could settle this sale.
 *
 * ORDERING. Serial and desktop-only — the four steps are one lifecycle and each
 * test continues the previous one's row.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { LOCALE, ACCOUNTS } from './utils/constants'
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
  id: '00000000-0000-0000-0000-000000000305',
  slug: 'qa-manual-sale',
  name: 'QA Manual Sale',
  // No throwaway platform plan — the tenant stays on `free`. `destroyQaTenant`
  // deletes by this slug, which simply matches nothing.
  planSlug: 'e2e-manual-sale-no-plan',
}

/**
 * The tenant SUBDOMAIN, not the platform root: every page here is
 * tenant-scoped, and `getCurrentTenantId()` reads the `x-tenant-id` header
 * proxy.ts derives from the host. Chromium resolves it through
 * `--host-resolver-rules` (playwright.config.ts), and CI pins it in /etc/hosts
 * alongside the other QA hostnames.
 */
const QA_BASE = tenantBase(QA.slug)

const RUN = Date.now()
const SALE_AMOUNT = 64.5
const PAYMENT_METHOD = 'Bank Transfer'
const INSTRUCTIONS = `Wire to IBAN QA-${RUN}`
const ADMIN_NOTE = `Receipt seen ${RUN}`
const STUDENT_PHONE = '+34 600 000 000'

type Admin = ReturnType<typeof getAdmin>

// ---------------------------------------------------------------------------
// DB readers. Reads only — nothing here advances the flow.
// ---------------------------------------------------------------------------

async function readRequest(admin: Admin, requestId: number) {
  const { data, error } = await admin
    .from('payment_requests')
    .select(
      'request_id, status, user_id, tenant_id, product_id, plan_id, payment_amount, payment_currency, payment_method, payment_instructions, contact_name, contact_email, contact_phone, admin_notes, payment_confirmed_at, processed_by',
    )
    .eq('request_id', requestId)
    .single()
  if (error) throw new Error(`could not read payment request ${requestId}: ${error.message}`)
  return data
}

/** The student's open request for a product, or null. Polled after each UI step. */
async function findRequest(admin: Admin, productId: number) {
  const { data, error } = await admin
    .from('payment_requests')
    .select('request_id, status')
    .eq('tenant_id', QA.id)
    .eq('user_id', SEEDED.student.id)
    .eq('product_id', productId)
    .maybeSingle()
  if (error) throw new Error(`could not look up the payment request: ${error.message}`)
  return data
}

/** `transactions` has NO `created_at` — the column is `transaction_date`. */
async function transactionsOf(admin: Admin, productId: number) {
  const { data, error } = await admin
    .from('transactions')
    .select(
      'transaction_id, status, user_id, tenant_id, product_id, plan_id, amount, currency, payment_method, payment_provider, refunded_amount, school_percentage_snapshot, transaction_date',
    )
    .eq('tenant_id', QA.id)
    .eq('product_id', productId)
  if (error) throw new Error(`could not read transactions for product ${productId}: ${error.message}`)
  return data ?? []
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

async function insertProduct(
  admin: Admin,
  name: string,
  price: number,
  courseIds: number[],
): Promise<number> {
  const { data, error } = await admin
    .from('products')
    .insert({
      name,
      description: 'Manual sale fixture',
      price,
      currency: 'usd',
      status: 'active',
      payment_provider: 'manual',
      tenant_id: QA.id,
    })
    .select('product_id')
    .single()
  if (error) throw new Error(`could not insert product "${name}": ${error.message}`)
  const productId = data.product_id as number
  for (const courseId of courseIds) {
    const { error: mapError } = await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: QA.id })
    if (mapError) {
      throw new Error(`could not map product ${productId} to course ${courseId}: ${mapError.message}`)
    }
  }
  return productId
}

/**
 * Everything this spec creates, children before parents. Safe on a clean
 * database, and it also runs FIRST in `beforeAll` — that is what makes a second
 * run safe after a crash. Every delete is checked, so a silently failing one
 * surfaces here and not as a baffling assertion failure three tests later.
 */
async function teardown() {
  const admin = getAdmin()
  const wipe = async (what: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run
    if (error) throw new Error(`teardown could not clear ${what}: ${error.message}`)
  }

  // The notification fan-out the actions write for the student (notifications →
  // user_notifications). `user_notifications` has no tenant_id, so it goes by
  // the ids of the rows we are about to delete.
  const { data: notifications } = await admin.from('notifications').select('id').eq('tenant_id', QA.id)
  const notificationIds = (notifications ?? []).map((row) => row.id as string)
  if (notificationIds.length > 0) {
    await wipe(
      'user_notifications',
      admin.from('user_notifications').delete().in('notification_id', notificationIds),
    )
  }
  await wipe('notifications', admin.from('notifications').delete().eq('tenant_id', QA.id))
  await wipe('invoices', admin.from('invoices').delete().eq('tenant_id', QA.id))
  await wipe('payment_requests', admin.from('payment_requests').delete().eq('tenant_id', QA.id))
  // transactions reference products, and products/product_courses are not part
  // of destroyQaTenant's cascade — drop them in FK order first.
  await wipe('transactions', admin.from('transactions').delete().eq('tenant_id', QA.id))
  await wipe('product_courses', admin.from('product_courses').delete().eq('tenant_id', QA.id))
  await wipe('products', admin.from('products').delete().eq('tenant_id', QA.id))
  // entitlements / enrollments / courses / tenant_users / tenants.
  await destroyQaTenant(admin, QA)
}

// ---------------------------------------------------------------------------
// UI helpers. Both of these exist because of how this app's primitives behave,
// not as generic politeness.
// ---------------------------------------------------------------------------

/** base-ui Buttons ignore Playwright's synthetic click; dispatch a DOM click. */
async function domClick(locator: Locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 30_000 })
  await locator.first().evaluate((el) => (el as HTMLElement).click())
}

/**
 * Fill a React-controlled field and prove the value survived hydration — a
 * `fill()` that lands before the first client render is wiped, and the action
 * then runs with an empty string (which `sendPaymentInstructions` rejects as
 * "instructions required", several seconds later and nowhere near the cause).
 */
async function fillSettled(page: Page, selector: string, value: string) {
  const field = page.locator(selector)
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(300)
        return field.inputValue()
      },
      { timeout: 30_000, intervals: [300, 600, 1000] },
    )
    .toBe(value)
}

/** Wait for the server action's write to land, reading the row back. */
async function expectStatus(admin: Admin, requestId: number, status: string) {
  await expect
    .poll(async () => (await readRequest(admin, requestId)).status, {
      timeout: 30_000,
      intervals: [500, 1000],
    })
    .toBe(status)
}

test.describe.configure({ mode: 'serial' })

test.describe('Manual (offline) — a request an admin confirms becomes a sale and access (#741)', () => {
  let courseIds: number[] = []
  let saleProductId: number
  let freeProductId: number
  let requestId: number

  /**
   * One context per actor for the whole file. The student's and the admin's
   * sessions are different cookies on the same host, and re-logging in for each
   * step would spend GoTrue's per-IP rate limit for nothing.
   */
  let studentPage: Page | undefined
  let adminPage: Page | undefined

  test.beforeAll(async () => {
    const admin = getAdmin()
    await teardown() // a crashed previous run must not poison this one

    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')

    // TWO courses on the sold product: `enroll_user` loops `product_courses`,
    // and a one-course fixture cannot tell a loop from a single insert.
    courseIds = [
      await insertCourse(admin, QA.id, `Manual Sale Course A ${RUN}`, { status: 'published' }),
      await insertCourse(admin, QA.id, `Manual Sale Course B ${RUN}`, { status: 'published' }),
    ].sort((a, b) => a - b)

    saleProductId = await insertProduct(admin, `Manual Bundle ${RUN}`, SALE_AMOUNT, courseIds)
    // A free offering: price 0, provider `manual` — exactly what the product
    // wizard writes when a creator gives a course away (#727).
    freeProductId = await insertProduct(admin, `Manual Free Offering ${RUN}`, 0, [courseIds[0]])
  })

  test.afterAll(async () => {
    await studentPage?.context().close()
    await adminPage?.context().close()
    await teardown()
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!['desktop-chromium', 'human'].includes(testInfo.project.name), 'runs once — DB state is shared')
    // Locally the webServer is `next dev`: the first visit to each of these
    // routes pays Turbopack's on-demand compile inside the test budget, and
    // this file visits four of them. CI runs `next start` on a prebuilt app.
    testInfo.setTimeout(240_000)
  })

  async function asStudent(browser: import('@playwright/test').Browser): Promise<Page> {
    if (studentPage) return studentPage
    const context = await browser.newContext()
    const page = await context.newPage()
    // Logging in ON the QA subdomain is load-bearing: the JWT `tenant_id` claim
    // is re-synced by the membership block in proxy.ts on a PAGE request, and
    // every RLS read on these pages is scoped by it. A login on the platform
    // root would leave the claim on the default tenant.
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    studentPage = page
    return page
  }

  async function asAdmin(browser: import('@playwright/test').Browser): Promise<Page> {
    if (adminPage) return adminPage
    const context = await browser.newContext()
    const page = await context.newPage()
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    adminPage = page
    return page
  }

  test('the student asks to pay offline and the request is priced from the product, not the browser', async ({
    browser,
  }) => {
    const admin = getAdmin()
    const page = await asStudent(browser)

    await page.goto(`${QA_BASE}/${LOCALE}/checkout/manual?productId=${saleProductId}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByTestId('manual-checkout-title')).toBeVisible({ timeout: 60_000 })

    // The only two things the student can actually type. Note what is NOT on
    // this form: a price, a currency, a name or an email.
    await fillSettled(page, '#contactPhone', STUDENT_PHONE)
    await domClick(page.getByTestId('payment-request-submit'))
    await expect(page.getByTestId('payment-request-success')).toBeVisible({ timeout: 60_000 })

    const created = await findRequest(admin, saleProductId)
    expect(created, 'createPaymentRequest wrote no row').not.toBeNull()
    requestId = created!.request_id as number

    const row = await readRequest(admin, requestId)
    expect(row.status).toBe('pending')
    expect(row.tenant_id).toBe(QA.id)
    expect(row.user_id).toBe(SEEDED.student.id)
    expect(row.plan_id).toBeNull()
    // Server-derived money. The form never sent these.
    expect(Number(row.payment_amount)).toBeCloseTo(SALE_AMOUNT, 2)
    expect(row.payment_currency).toBe('usd')
    // Server-derived identity: the session's email and the profile's name, not
    // the client's (the action takes client values only as a fallback).
    expect(row.contact_email).toBe(SEEDED.student.email)
    expect(row.contact_name).toBeTruthy()
    expect(row.contact_phone).toBe(STUDENT_PHONE)

    // Asking is not buying: no money and no access yet.
    expect(await transactionsOf(admin, saleProductId)).toHaveLength(0)
    expect(await entitlementsOf(admin, SEEDED.student.id, saleProductId)).toHaveLength(0)
  })

  test('a free product never shows a payment form and mints no request', async ({ browser }) => {
    const admin = getAdmin()
    const page = await asStudent(browser)

    // A free offering is a `manual` product with price 0, so without a guard
    // every giveaway would land in the admin's queue as a bill nobody can pay.
    // The page sends the student to the product's one-click enrollment before
    // any form exists (#749); `createPaymentRequest` still refuses a $0 product
    // server-side for any caller that skips the page.
    await page.goto(`${QA_BASE}/${LOCALE}/checkout/manual?productId=${freeProductId}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).toHaveURL(new RegExp(`/products/${freeProductId}(\\?|$)`), { timeout: 60_000 })
    await expect(page.getByTestId('payment-request-submit')).toHaveCount(0)
    expect(await findRequest(admin, freeProductId)).toBeNull()
  })

  test('the admin sends instructions, which is what makes the request confirmable', async ({ browser }) => {
    const admin = getAdmin()
    const page = await asAdmin(browser)

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/payment-requests/${requestId}`, {
      waitUntil: 'domcontentloaded',
    })
    await domClick(page.getByTestId('payment-request-send-instructions'))
    await fillSettled(page, '#paymentMethod', PAYMENT_METHOD)
    await fillSettled(page, '#paymentInstructions', INSTRUCTIONS)
    await domClick(page.getByTestId('payment-request-send-instructions-submit'))

    await expectStatus(admin, requestId, 'contacted')
    const row = await readRequest(admin, requestId)
    expect(row.payment_method).toBe(PAYMENT_METHOD)
    expect(row.payment_instructions).toBe(INSTRUCTIONS)
    // Still nothing bought — `contacted` is a conversation, not a sale.
    expect(await transactionsOf(admin, saleProductId)).toHaveLength(0)
  })

  test('confirming receipt records who saw the money, and grants nothing yet', async ({ browser }) => {
    const admin = getAdmin()
    const page = await asAdmin(browser)

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/payment-requests/${requestId}`, {
      waitUntil: 'domcontentloaded',
    })
    await domClick(page.getByTestId('payment-request-confirm-payment'))
    await fillSettled(page, '#adminNotes', ADMIN_NOTE)
    await domClick(page.getByTestId('payment-request-confirm-payment-submit'))

    await expectStatus(admin, requestId, 'payment_received')
    const row = await readRequest(admin, requestId)
    expect(row.admin_notes).toBe(ADMIN_NOTE)
    expect(row.payment_confirmed_at).not.toBeNull()
    expect(row.processed_by).toBe(SEEDED.owner.id)

    // LOAD-BEARING, and the reason this step is its own test: "I saw the money"
    // and "the student may enter" are deliberately two different events. If
    // this ever starts granting access, a school that confirms a transfer that
    // later bounces has already given the course away.
    expect(await transactionsOf(admin, saleProductId)).toHaveLength(0)
    expect(await entitlementsOf(admin, SEEDED.student.id, saleProductId)).toHaveLength(0)

    // And the door is shut where it actually matters — the app's own gate, not
    // just the absence of rows. `requireCourseAccess` bounces a student with no
    // entitlement back to the dashboard.
    const student = await asStudent(browser)
    await student.goto(`${QA_BASE}/${LOCALE}/dashboard/student/courses/${courseIds[0]}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(student).toHaveURL(/\/dashboard\/student\/?$/, { timeout: 60_000 })
  })

  test('completing the request writes ONE sale and grants every mapped course', async ({ browser }) => {
    const admin = getAdmin()
    const page = await asAdmin(browser)

    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/payment-requests/${requestId}`, {
      waitUntil: 'domcontentloaded',
    })
    await domClick(page.getByTestId('payment-request-complete'))
    await domClick(page.getByTestId('payment-request-complete-submit'))

    await expectStatus(admin, requestId, 'completed')

    const sales = await transactionsOf(admin, saleProductId)
    expect(sales).toHaveLength(1)
    const sale = sales[0]
    expect(sale.status).toBe('successful')
    expect(sale.user_id).toBe(SEEDED.student.id)
    expect(sale.tenant_id).toBe(QA.id)
    expect(sale.plan_id).toBeNull()
    // Carried from the request, which carried it from the product.
    expect(Number(sale.amount)).toBeCloseTo(SALE_AMOUNT, 2)
    expect(sale.currency).toBe('usd')
    expect(Number(sale.refunded_amount)).toBe(0)
    // `manual - <method>` only when the admin typed one, never the literal
    // "manual - null" the transactions table used to print (#727).
    expect(sale.payment_method).toBe(`manual - ${PAYMENT_METHOD}`)
    // The split is stamped by the DB, not by the action (#512) — this is what
    // the school's revenue view and `getPayoutsOwed` both read back.
    expect(sale.school_percentage_snapshot).not.toBeNull()
    // Said on the row, not inferred (#746): a NULL provider silently drops out
    // of any reader that filters or groups on the column instead of going
    // through `resolveProvider()`, and offline is most new schools' only rail.
    expect(sale.payment_provider).toBe('manual')

    // Everything below is Postgres: after_transaction_insert →
    // trigger_manage_transactions → enroll_user, which loops ALL of
    // product_courses (hence two courses on this product).
    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(courseIds.length)
    for (const courseId of courseIds) {
      expect(grants).toContainEqual(
        expect.objectContaining({
          course_id: courseId,
          tenant_id: QA.id,
          source_type: 'product',
          source_id: saleProductId,
          status: 'active',
          revoked_at: null,
        }),
      )
    }

    const { data: enrollments, error } = await admin
      .from('enrollments')
      .select('course_id, status')
      .eq('user_id', SEEDED.student.id)
      .eq('tenant_id', QA.id)
      .order('course_id')
    if (error) throw new Error(`could not read enrollments: ${error.message}`)
    expect(enrollments).toEqual(courseIds.map((course_id) => ({ course_id, status: 'active' })))

    // The whole point of the money, proven through the gate the student meets:
    // the same URL that bounced them one test ago now opens. Rows alone do not
    // say this — `resolveCourseAccessState` reads entitlements AND the tenant's
    // access cutoff, so a grant the platform has suspended still fails here.
    const student = await asStudent(browser)
    await student.goto(`${QA_BASE}/${LOCALE}/dashboard/student/courses/${courseIds[0]}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(student).toHaveURL(new RegExp(`/dashboard/student/courses/${courseIds[0]}`), {
      timeout: 60_000,
    })
    await expect(student.getByText(`Manual Sale Course A ${RUN}`).first()).toBeVisible({
      timeout: 60_000,
    })

    // A completed request offers no way to do any of it again — the three
    // action buttons are status-gated, and `completeAndEnroll` refuses a
    // non-`payment_received` row besides.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('payment-request-complete')).toHaveCount(0)
    await expect(page.getByTestId('payment-request-confirm-payment')).toHaveCount(0)
    expect(await transactionsOf(admin, saleProductId)).toHaveLength(1)
  })

  test('another school’s admin cannot open this request at all', async ({ browser }) => {
    const admin = getAdmin()
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      // A real admin — of a DIFFERENT school, and not a super admin (the seeded
      // owner is one, which would make this prove nothing).
      await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, tenantBase('code-academy'))
      await page.goto(
        `${tenantBase('code-academy')}/${LOCALE}/dashboard/admin/payment-requests/${requestId}`,
        { waitUntil: 'domcontentloaded' },
      )

      // The detail page's read is `.eq('request_id').eq('tenant_id')` — on the
      // other school's subdomain that matches nothing and the page redirects to
      // the list, so there is never a form through which this sale could be
      // touched from outside the school that made it.
      await expect(page).toHaveURL(/\/dashboard\/admin\/payment-requests\/?$/, { timeout: 60_000 })
      await expect(page.getByText(String(requestId))).toHaveCount(0)

      // And nothing moved.
      expect((await readRequest(admin, requestId)).status).toBe('completed')
      expect(await transactionsOf(admin, saleProductId)).toHaveLength(1)
    } finally {
      await context.close()
    }
  })
})
