/**
 * Fee bearer — the school can pass the platform fee to the buyer (#927).
 *
 * Pins, on a real database:
 *   1. the column defaults: an untouched product and a transaction both read
 *      `fee_bearer = 'school'` (the historical behaviour, so the migration is
 *      backfill-safe);
 *   2. the CHECK constraints reject anything but school | student;
 *   3. a transaction's bearer snapshot is frozen once written (an UPDATE that
 *      changes it RAISES check_violation; one that leaves it alone succeeds);
 *   4. the checkout page shows the buyer the grossed-up amount the checkout
 *      routes charge, with the "includes the platform fee" note — and the
 *      listed price when the school bears it;
 *   5. the admin product editor renders the two-sided breakdown.
 *
 * Fixture: one `[E2E] #927` published course on Code Academy with a $100
 * PayPal product (PayPal bears a platform fee and charges our amount, so the
 * student bearer applies; nothing here calls PayPal).
 */
import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { getServiceRoleClient, CODE_ACADEMY_TENANT, ALICE_ID } from './utils/seed-state'
import { loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { chargedAmount } from '@/lib/payments/fee-bearer'

const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // creator@codeacademy.com
const FIXTURE_PREFIX = '[E2E] #927'
const RUN = Date.now()
const PRICE = 100

let courseId: number
let productId: number
let schoolPercentage = 80

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data as NonNullable<T>
}

async function removeStaleFixtures(admin: SupabaseClient) {
  const { data: products } = await admin
    .from('products')
    .select('product_id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .like('name', `${FIXTURE_PREFIX}%`)
  for (const p of products ?? []) {
    await admin.from('transactions').delete().eq('product_id', p.product_id)
    await admin.from('products').delete().eq('product_id', p.product_id)
  }
  await admin.from('courses').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('title', `${FIXTURE_PREFIX}%`)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeStaleFixtures(admin)

  const { data: split } = await admin
    .from('revenue_splits')
    .select('school_percentage')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .maybeSingle()
  schoolPercentage = Number(split?.school_percentage ?? 80)

  courseId = must(
    await admin
      .from('courses')
      .insert({
        title: `${FIXTURE_PREFIX} Fee Bearer Course ${RUN}`,
        description: 'Seeded by fee-bearer.spec.ts. Safe to delete.',
        status: 'published',
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('course_id')
      .single(),
    'seed course',
  ).course_id

  productId = must(
    await admin
      .from('products')
      .insert({
        name: `${FIXTURE_PREFIX} Product ${RUN}`,
        description: 'Paid access to the #927 course.',
        price: PRICE,
        currency: 'usd',
        status: 'active',
        payment_provider: 'paypal',
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('product_id')
      .single(),
    'seed product',
  ).product_id

  must(
    await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: CODE_ACADEMY_TENANT })
      .select('product_id'),
    'seed product_courses',
  )
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  if (productId) {
    await admin.from('transactions').delete().eq('product_id', productId)
    await admin.from('products').delete().eq('product_id', productId)
  }
  if (courseId) await admin.from('courses').delete().eq('course_id', courseId)
})

test.describe('Fee bearer (#927) — schema', () => {
  test('a new product defaults to the school bearing the fee', async () => {
    const admin = getServiceRoleClient()
    const { data } = await admin.from('products').select('fee_bearer').eq('product_id', productId).single()
    expect(data?.fee_bearer).toBe('school')
  })

  test('only school | student are accepted', async () => {
    const admin = getServiceRoleClient()
    const { error } = await admin.from('products').update({ fee_bearer: 'buyer' }).eq('product_id', productId)
    expect(error?.code).toBe('23514') // check_violation
  })

  test("a transaction's bearer snapshot is frozen once written", async () => {
    const admin = getServiceRoleClient()
    const tx = must(
      await admin
        .from('transactions')
        .insert({
          user_id: ALICE_ID,
          tenant_id: CODE_ACADEMY_TENANT,
          product_id: productId,
          amount: chargedAmount(PRICE, 100 - schoolPercentage, 'student'),
          currency: 'usd',
          // Canceled keeps the row out of transactions_unique_product.
          status: 'canceled',
          payment_provider: 'paypal',
          fee_bearer: 'student',
        })
        .select('transaction_id, fee_bearer')
        .single(),
      'seed transaction',
    )
    expect(tx.fee_bearer).toBe('student')

    // Changing it fails loudly — not a silent no-op that reports success.
    const { error } = await admin
      .from('transactions')
      .update({ fee_bearer: 'school' })
      .eq('transaction_id', tx.transaction_id)
    expect(error?.code).toBe('23514') // check_violation

    // An incidental update that does not change it (a webhook, a refund) passes.
    const { error: incidental } = await admin
      .from('transactions')
      .update({ status: 'canceled', fee_bearer: 'student' })
      .eq('transaction_id', tx.transaction_id)
    expect(incidental).toBeNull()

    const { data: after } = await admin
      .from('transactions')
      .select('fee_bearer')
      .eq('transaction_id', tx.transaction_id)
      .single()
    expect(after?.fee_bearer).toBe('student')
  })
})

test.describe('Fee bearer (#927) — checkout and editor', () => {
  test('school bears: checkout shows the listed price, no fee note', async ({ page }) => {
    const admin = getServiceRoleClient()
    await admin.from('products').update({ fee_bearer: 'school' }).eq('product_id', productId)

    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/checkout?courseId=${courseId}`)
    await expect(page.getByText('$100.00').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('checkout-fee-included')).toHaveCount(0)
  })

  test('student bears: checkout shows the grossed-up amount and the fee note', async ({ page }) => {
    const admin = getServiceRoleClient()
    await admin.from('products').update({ fee_bearer: 'student' }).eq('product_id', productId)
    const expected = chargedAmount(PRICE, 100 - schoolPercentage, 'student')
    test.skip(expected === PRICE, 'Code Academy is on a 0% fee split — nothing to pass on')

    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/checkout?courseId=${courseId}`)
    const formatted = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(expected)
    await expect(page.getByText(formatted).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('checkout-fee-included')).toBeVisible()
  })

  test('admin editor shows the fee breakdown', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/products/${productId}/edit`)
    const card = page.getByTestId('fee-bearer-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('fee-bearer-breakdown')).toContainText('$100.00')
  })
})
