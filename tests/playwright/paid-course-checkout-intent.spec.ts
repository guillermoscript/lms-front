/**
 * Paid-course CTA keeps checkout intent for a brand-new visitor (#684).
 *
 * The free path (loop-2-student-learns.spec.ts) survives sign-up because
 * `enrollFree` joins the school itself. The paid path did not: `/checkout` is a
 * protected route, so after sign-up proxy.ts bounced the still-memberless
 * visitor to `/join-school` with no `next`, and the Join button always sent
 * them to the student dashboard. This spec pins the repaired chain:
 *
 *   anonymous /courses/<id> → "Enroll Now" → login (next kept) → sign-up
 *   (next kept) → /join-school?next=/checkout?courseId=<id> → Join →
 *   checkout for that course
 *
 * plus the guard that a tampered `next` (cross-origin) degrades to the
 * dashboard instead of redirecting off-site.
 *
 * Fixture: one `[E2E] #684` published course on Code Academy with a $49
 * manual product (no Stripe needed — the checkout page hands a manual product
 * to /checkout/manual, which is still "the checkout for that course").
 */
import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

const BASE = TENANT_BASE
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // creator@codeacademy.com
const FIXTURE_PREFIX = '[E2E] #684'
const RUN = Date.now()
const PASSWORD = 'password123'

let courseId: number
let productId: number
const createdUserIds: string[] = []

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data as NonNullable<T>
}

async function removeStaleFixtures(admin: SupabaseClient) {
  const { data: courses } = await admin
    .from('courses')
    .select('course_id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .like('title', `${FIXTURE_PREFIX}%`)
  for (const c of courses ?? []) await admin.from('courses').delete().eq('course_id', c.course_id)
  await admin.from('products').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('name', `${FIXTURE_PREFIX}%`)

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of users?.users ?? []) {
    if (u.email?.startsWith('paid684-') && u.email.endsWith('@e2etest.com')) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeStaleFixtures(admin)

  courseId = must(
    await admin
      .from('courses')
      .insert({
        title: `${FIXTURE_PREFIX} Paid Course ${RUN}`,
        description: 'Seeded by paid-course-checkout-intent.spec.ts. Safe to delete.',
        status: 'published',
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('course_id')
      .single(),
    'seed course'
  ).course_id

  productId = must(
    await admin
      .from('products')
      .insert({
        name: `${FIXTURE_PREFIX} Product ${RUN}`,
        description: 'Paid access to the #684 course.',
        price: 49,
        currency: 'usd',
        status: 'active',
        payment_provider: 'manual',
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('product_id')
      .single(),
    'seed product'
  ).product_id

  must(
    await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: CODE_ACADEMY_TENANT })
      .select('product_id'),
    'seed product_courses'
  )
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  for (const userId of createdUserIds) {
    await admin.from('tenant_users').delete().eq('user_id', userId)
    await admin.from('gamification_profiles').delete().eq('user_id', userId)
    await admin.auth.admin.deleteUser(userId)
  }
  if (courseId) await admin.from('courses').delete().eq('course_id', courseId)
  if (productId) await admin.from('products').delete().eq('product_id', productId)
})

/** Fill a React-controlled input and prove the value survived hydration. */
async function fillSettled(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId)
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(500)
        return field.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toBe(value)
}

/** base-ui Buttons ignore Playwright's synthetic click; dispatch a DOM click. */
async function domClick(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.first().waitFor({ state: 'visible', timeout: 30_000 })
  await locator.first().evaluate((el) => (el as HTMLElement).click())
}

async function rememberUser(email: string) {
  const admin = getServiceRoleClient()
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const id = users?.users.find((u) => u.email === email)?.id
  if (id) createdUserIds.push(id)
  return id ?? null
}

test.describe('Paid course CTA keeps checkout intent for a new visitor (#684)', () => {
  test('sign-up from the paid CTA lands on the course checkout after joining the school', async ({ page }) => {
    test.setTimeout(300_000)
    const email = `paid684-${RUN}@e2etest.com`
    const checkoutPath = `/checkout?courseId=${courseId}`

    await test.step('anonymous course page sends the visitor to sign-up with the checkout as next', async () => {
      await page.goto(`${BASE}/${LOCALE}/courses/${courseId}`, { waitUntil: 'domcontentloaded' })
      const cta = page.getByTestId('course-enroll-cta')
      await expect(cta).toBeVisible({ timeout: 30_000 })
      await expect(cta).toHaveText(/enroll now/i)

      // Sign-up is the primary path for a first-time visitor (#685); the
      // login link beside it carries the same checkout intent.
      const loginLink = page.getByTestId('course-enroll-login')
      await expect(loginLink).toBeVisible({ timeout: 30_000 })
      expect(await loginLink.getAttribute('href')).toContain(encodeURIComponent(checkoutPath))

      await domClick(page, cta)
      await page.waitForURL(/\/auth\/sign-up\?/, { timeout: 30_000 })
      expect(new URL(page.url()).searchParams.get('next')).toBe(checkoutPath)
    })

    await test.step('after sign-up the non-member is asked to join with the checkout preserved as next', async () => {
      await fillSettled(page, 'signup-name', 'Paid Path Visitor')
      await fillSettled(page, 'signup-email', email)
      await fillSettled(page, 'signup-password', PASSWORD)
      await domClick(page, page.getByTestId('signup-submit'))

      await page.waitForURL(/\/join-school\?/, { timeout: 90_000 })
      expect(new URL(page.url()).searchParams.get('next')).toBe(checkoutPath)
      await expect(page.getByTestId('join-school-title')).toBeVisible({ timeout: 60_000 })
      expect(await rememberUser(email), 'sign-up created an auth user').toBeTruthy()
    })

    await test.step('joining the school lands on the checkout for that course, not the dashboard', async () => {
      await domClick(page, page.getByTestId('join-school-submit'))
      // A manual product is handed from /checkout to /checkout/manual — still
      // the checkout for this course. The dashboard is the failure mode.
      await page.waitForURL(/\/checkout(?:\/manual)?\?/, { timeout: 90_000 })
      const url = new URL(page.url())
      expect(url.pathname).not.toContain('/dashboard')
      expect(url.searchParams.get('courseId')).toBe(String(courseId))
    })
  })

  test('a tampered cross-origin next falls back to the student dashboard', async ({ page }) => {
    test.setTimeout(180_000)
    const admin = getServiceRoleClient()
    const email = `paid684-tamper-${RUN}@e2etest.com`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Tamper Visitor' },
    })
    if (createError || !created.user) throw new Error(`create tamper user: ${createError?.message ?? 'no user'}`)
    createdUserIds.push(created.user.id)

    await page.goto(`${BASE}/${LOCALE}/auth/login?next=${encodeURIComponent('/join-school')}`, {
      waitUntil: 'domcontentloaded',
    })
    await fillSettled(page, 'login-email', email)
    await fillSettled(page, 'login-password', PASSWORD)
    await domClick(page, page.getByTestId('login-submit'))
    await page.waitForURL(/\/join-school/, { timeout: 60_000 })

    await page.goto(`${BASE}/${LOCALE}/join-school?next=${encodeURIComponent('https://evil.example/phish')}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByTestId('join-school-title')).toBeVisible({ timeout: 60_000 })
    await domClick(page, page.getByTestId('join-school-submit'))
    await page.waitForURL(/\/dashboard\/student/, { timeout: 90_000 })
    expect(new URL(page.url()).hostname).toBe(new URL(BASE).hostname)
  })
})
