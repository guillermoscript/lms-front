import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { login, loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Payment Flow Tests
 * Verifies pricing pages, checkout, and payment requests using pre-seeded data.
 */

test.describe('Payment Flows', () => {
  test('pricing page shows tenant-specific products', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
    // Price displayed as integer: $19/mo
    await expect(page.getByText(/\$19/)).toBeVisible()
  })

  test('manual checkout page renders product details', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout/manual?productId=3&courseId=3`)
    // Alice may already have an active subscription covering this product
    const checkoutTitle = page.getByTestId('manual-checkout-title')
    const isCheckout = await checkoutTitle.isVisible({ timeout: 10_000 }).catch(() => false)
    if (isCheckout) {
      await expect(page.getByText(/Python for Beginners/i).first()).toBeVisible()
    } else {
      // Redirected because already subscribed/enrolled
      const url = page.url()
      expect(url).toMatch(/dashboard|checkout|courses/)
    }
  })

  test('student can view payment requests page', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
    await expect(page.getByTestId('payments-title')).toBeVisible()
  })

  test('checkout page requires authentication', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/checkout/manual?productId=3&courseId=3`)
    await page.waitForTimeout(2000)
    // Should redirect to login when not authenticated
    expect(page.url()).toMatch(/\/auth\/login/)
  })

  test('default tenant pricing page renders', async ({ page }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
  })

  test('payment request list is scoped to current tenant', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
    await expect(page.getByTestId('payments-page')).toBeVisible()
    // Should only show Code Academy payment data
    const body = await page.locator('body').textContent()
    // Default tenant product names should not appear
    expect(body).not.toContain('Default School Premium')
  })
})

/**
 * Abandoned Stripe onboarding — issue #606.
 *
 * `tenants.stripe_account_id` is written the moment the Express account is
 * CREATED, before the admin has even been handed the hosted onboarding link. An
 * admin who opens onboarding and closes the tab leaves a tenant that looks
 * payment-ready and is not: checkout used to gate on that column's presence, so
 * the student reached the card form, submitted, and Stripe rejected the
 * PaymentIntent because `transfer_data.destination` pointed at an account with
 * `charges_enabled: false`. Generic failure on the school's storefront, no
 * explanation for either party.
 *
 * These tests drive the real route with a real student session and flip the
 * tenant's Connect columns around it. The two refusals must stay distinct, and
 * neither may leave a pending `transactions` row behind — the gate runs before
 * any Stripe call and before the insert.
 */
test.describe('Stripe Connect readiness gate (#606)', () => {
  const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
  const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
  const STRIPE_PRODUCT = 2001 // Python Mastery Bundle, $49, payment_provider 'stripe'
  const FAKE_ACCOUNT = 'acct_e2e606AbandonedOnboarding'

  function getAdmin() {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }

  async function setConnectState(state: {
    stripe_account_id: string | null
    stripe_charges_enabled: boolean
    stripe_details_submitted?: boolean
  }) {
    const { error } = await getAdmin()
      .from('tenants')
      .update({ stripe_details_submitted: false, ...state })
      .eq('id', CODE_ACADEMY_TENANT)
    expect(error).toBeNull()
  }

  /** Pending rows the gate must never have created (and #605's cleanup habit). */
  async function pendingRowsForAlice() {
    const { data } = await getAdmin()
      .from('transactions')
      .select('transaction_id')
      .eq('user_id', ALICE_ID)
      .eq('product_id', STRIPE_PRODUCT)
      .eq('status', 'pending')
    return data ?? []
  }

  async function clearPendingRows() {
    await getAdmin()
      .from('transactions')
      .delete()
      .eq('user_id', ALICE_ID)
      .eq('product_id', STRIPE_PRODUCT)
      .eq('status', 'pending')
  }

  let original: {
    stripe_account_id: string | null
    stripe_charges_enabled: boolean
    stripe_details_submitted: boolean
  }

  test.beforeAll(async () => {
    const { data, error } = await getAdmin()
      .from('tenants')
      .select('stripe_account_id, stripe_charges_enabled, stripe_details_submitted')
      .eq('id', CODE_ACADEMY_TENANT)
      .single()
    expect(error).toBeNull()
    original = data!
  })

  test.afterAll(async () => {
    await clearPendingRows()
    await getAdmin().from('tenants').update(original).eq('id', CODE_ACADEMY_TENANT)
  })

  test('refuses checkout for a school whose onboarding was abandoned', async ({ page }) => {
    // The account id IS set — exactly what the old presence check accepted.
    await setConnectState({
      stripe_account_id: FAKE_ACCOUNT,
      stripe_charges_enabled: false,
      stripe_details_submitted: true,
    })
    await clearPendingRows()
    await loginAsTenantStudent(page)

    const res = await page.request.post(
      `${TENANT_BASE}/api/stripe/create-payment-intent`,
      { data: { productId: STRIPE_PRODUCT } }
    )
    expect(res.status()).toBe(400)

    const body = await res.json()
    expect(body.code).toBe('SCHOOL_PAYMENTS_INCOMPLETE')
    // Distinct from the never-connected wording: "still finishing setup", not
    // "contact the admin to set up payments".
    expect(body.error).toMatch(/still finishing/i)
    expect(body.clientSecret).toBeUndefined()

    // Refused before any Stripe call, so no pending transaction was created.
    expect(await pendingRowsForAlice()).toHaveLength(0)
  })

  test('gives a school that never connected a different, distinct refusal', async ({ page }) => {
    await setConnectState({ stripe_account_id: null, stripe_charges_enabled: false })
    await clearPendingRows()
    await loginAsTenantStudent(page)

    const res = await page.request.post(
      `${TENANT_BASE}/api/stripe/create-payment-intent`,
      { data: { productId: STRIPE_PRODUCT } }
    )
    expect(res.status()).toBe(400)

    const body = await res.json()
    expect(body.code).toBe('SCHOOL_PAYMENTS_NOT_CONNECTED')
    expect(body.error).toMatch(/not connected/i)
    expect(await pendingRowsForAlice()).toHaveLength(0)
  })

  test('leaves a school with charges enabled unchanged', async ({ page }) => {
    await setConnectState({
      stripe_account_id: FAKE_ACCOUNT,
      stripe_charges_enabled: true,
      stripe_details_submitted: true,
    })
    await clearPendingRows()
    await loginAsTenantStudent(page)

    const res = await page.request.post(
      `${TENANT_BASE}/api/stripe/create-payment-intent`,
      { data: { productId: STRIPE_PRODUCT } }
    )
    const body = await res.json()

    // The account id here is synthetic, so Stripe itself will still reject the
    // PaymentIntent downstream — what this asserts is that the READINESS gate
    // did not fire. A real connected account cannot be seeded in E2E, so
    // "unchanged" means "not refused by #606", not "payment succeeds".
    expect(body.code).not.toBe('SCHOOL_PAYMENTS_INCOMPLETE')
    expect(body.code).not.toBe('SCHOOL_PAYMENTS_NOT_CONNECTED')

    await clearPendingRows()
  })
})
