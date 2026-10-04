/**
 * Public entry CTAs send a first-time visitor to sign-up (#719).
 *
 * #685 fixed the public course page; the two remaining anonymous entry points
 * kept the original shape — a Login button at the moment of highest intent,
 * which the visitor who arrived by a shared link cannot use because they have
 * no account yet. Both now lead with `/auth/sign-up` and carry the returning
 * student on a secondary link with the *same* `next`.
 *
 * The product page was also hardcoded English (a #678/#689 leftover), so the
 * Spanish pass asserts the copy actually switches language.
 *
 * Reaching the product page anonymously at all is part of the fix: it lives in
 * the `(public)` route group and carries SEO metadata, but `proxy.ts` never
 * listed `/products`, so the shared link bounced off the login wall. The
 * tenant filter both pages now apply is what makes serving it to `anon` safe —
 * RLS on `products` is permissive for anonymous readers.
 *
 * Fixtures: seeded product 1002 (`Web Dev Starter`, manual, **$0**, Default
 * School), one throwaway priced COP manual product, and one throwaway $0
 * monthly plan on the same tenant — the Default School has no seeded plans, so
 * the free CTA needs one to render at all.
 *
 * #727: 1002 is priced 0, so it now takes the free path (no manual-payment
 * copy, "Enroll for free"); the manual-payment assertions moved to the priced
 * COP fixture, which also pins that a non-USD price is never shown as euros.
 */
import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BASE, TENANT_BASE } from './utils/constants'
import { getServiceRoleClient, DEFAULT_TENANT } from './utils/seed-state'

const SEEDED_FREE_PRODUCT = 1002
const FIXTURE_PLAN_NAME = '[E2E] #719 Free Plan'
const FIXTURE_PRODUCT_NAME = '[E2E] #727 COP Manual Product'

let freePlanId: number
let manualProductId: number

async function removeStalePlans(admin: SupabaseClient) {
  await admin.from('plans').delete().eq('tenant_id', DEFAULT_TENANT).eq('plan_name', FIXTURE_PLAN_NAME)
}

async function removeStaleProducts(admin: SupabaseClient) {
  await admin.from('products').delete().eq('tenant_id', DEFAULT_TENANT).eq('name', FIXTURE_PRODUCT_NAME)
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeStalePlans(admin)
  await removeStaleProducts(admin)

  const { data: product, error: productError } = await admin
    .from('products')
    .insert({
      name: FIXTURE_PRODUCT_NAME,
      description: 'Priced COP manual product used by the #719/#727 CTA regression.',
      price: 120000,
      currency: 'cop',
      status: 'active',
      payment_provider: 'manual',
      tenant_id: DEFAULT_TENANT,
    })
    .select('product_id')
    .single()
  if (productError || !product) throw new Error(`seed manual product: ${productError?.message ?? 'no row'}`)
  manualProductId = product.product_id

  const { data, error } = await admin
    .from('plans')
    .insert({
      plan_name: FIXTURE_PLAN_NAME,
      price: 0,
      duration_in_days: 30,
      description: 'Free tier used by the #719 anonymous-CTA regression.',
      features: JSON.stringify(['Anonymous CTA regression']),
      currency: 'usd',
      payment_provider: 'manual',
      tenant_id: DEFAULT_TENANT,
    })
    .select('plan_id')
    .single()
  if (error || !data) throw new Error(`seed free plan: ${error?.message ?? 'no row'}`)
  freePlanId = data.plan_id
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  await removeStalePlans(admin)
  await removeStaleProducts(admin)
})

test.describe('Public entry CTAs lead with sign-up (#719)', () => {
  test('the product page offers sign-up first and keeps the product as the destination', async ({ page }) => {
    const next = encodeURIComponent(`/products/${manualProductId}`)

    await page.goto(`${BASE}/en/products/${manualProductId}`, { waitUntil: 'domcontentloaded' })

    const cta = page.getByTestId('product-request-cta')
    await expect(cta).toBeVisible({ timeout: 30_000 })
    // The action label survives the change: the visitor still reads what the
    // button is for, they just get an account form they can actually fill.
    await expect(cta).toHaveText(/request payment info/i)
    expect(await cta.getAttribute('href')).toBe(`/auth/sign-up?next=${next}`)

    const loginLink = page.getByTestId('product-request-login')
    await expect(loginLink).toBeVisible()
    expect(await loginLink.getAttribute('href')).toBe(`/auth/login?next=${next}`)
  })

  test('the product page reads Spanish in /es', async ({ page }) => {
    await page.goto(`${BASE}/es/products/${manualProductId}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('product-request-cta')).toHaveText(/solicitar información de pago/i)
    await expect(page.getByText(/cómo funciona el pago manual/i)).toBeVisible()
    await expect(page.getByText(/método de pago/i)).toBeVisible()
    // #727: a COP price is formatted as COP, never guessed as euros or `$120000`.
    await expect(page.getByTestId('product-price')).toContainText(/COP|\$\s?120\.000/)
    await expect(page.getByTestId('product-price')).not.toContainText('€')
    // The English strings this page used to hardcode are gone, not merely
    // pushed down the page.
    await expect(page.getByText(/please login/i)).toHaveCount(0)
    await expect(page.getByText(/how manual payment works/i)).toHaveCount(0)
  })

  test('a $0 product takes the free path, not the manual-payment flow (#727)', async ({ page }) => {
    const next = encodeURIComponent(`/products/${SEEDED_FREE_PRODUCT}`)

    await page.goto(`${BASE}/es/products/${SEEDED_FREE_PRODUCT}`, { waitUntil: 'domcontentloaded' })

    const cta = page.getByTestId('product-request-cta')
    await expect(cta).toHaveText(/inscribirme gratis/i, { timeout: 30_000 })
    expect(await cta.getAttribute('href')).toBe(`/auth/sign-up?next=${next}`)
    await expect(page.getByTestId('product-price')).toHaveText(/gratis/i)
    await expect(page.getByText(/cómo funciona el pago manual/i)).toHaveCount(0)
    await expect(page.getByText(/método de pago/i)).toHaveCount(0)
  })

  test('another school cannot read this one\u2019s product anonymously', async ({ page }) => {
    // Product 1002 belongs to the Default School; Code Academy must not serve
    // it now that the route answers anonymous requests.
    await page.goto(`${TENANT_BASE}/en/products/${SEEDED_FREE_PRODUCT}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).toHaveURL(/\/products\/?$/)
    await expect(page.getByTestId('product-request-cta')).toHaveCount(0)
  })

  test('the free-plan CTA offers sign-up first and keeps the subscribe intent', async ({ page }) => {
    const next = encodeURIComponent(`/pricing?subscribe=${freePlanId}`)

    await page.goto(`${BASE}/en/pricing`, { waitUntil: 'domcontentloaded' })

    const cta = page.getByTestId(`subscribe-free-${freePlanId}`)
    await expect(cta).toBeVisible({ timeout: 30_000 })
    expect(await cta.getAttribute('href')).toBe(`/auth/sign-up?next=${next}`)

    const loginLink = page.getByTestId(`subscribe-free-login-${freePlanId}`)
    await expect(loginLink).toBeVisible()
    expect(await loginLink.getAttribute('href')).toBe(`/auth/login?next=${next}`)
  })
})
