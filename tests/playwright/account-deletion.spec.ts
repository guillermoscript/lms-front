/**
 * Account deletion (#850) — required by Google Play and the App Store.
 *
 *   1. A throwaway student with a paid sale and an open manual payment
 *      request deletes their account from the profile page: they land on the
 *      public /delete-account page with the "deleted" notice, the auth user
 *      and profile are gone, the sale stays anonymised (user_id NULL, still
 *      `successful`) and the payment request is cancelled and scrubbed.
 *   2. The only admin of Code Academy opens the same dialog from the admin
 *      settings and is told why they can't delete yet — nothing is deleted.
 *   3. The public page explains deletion to a logged-out visitor (the URL a
 *      Play listing links to).
 *
 * The API itself (Bearer, confirmation mismatch, 409) is pinned in the same
 * file against `/api/account/delete`.
 */
import { test, expect, type Locator } from './utils/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BASE, TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'
import { login } from './utils/auth'
import { getServiceRoleClient, DEFAULT_TENANT } from './utils/seed-state'

test.describe.configure({ mode: 'serial' })

const PASSWORD = 'password123'
const PRODUCT_ID = 1001 // Testing Fundamentals Package, Default School
const RUN_ID = Date.now().toString(36)
const STUDENT = `qa-850-student-${RUN_ID}@e2etest.com`

let admin: SupabaseClient
let studentId: string | null = null
let transactionId: number | null = null
let requestId: number | null = null

test.beforeAll(async () => {
  admin = getServiceRoleClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: STUDENT,
    password: PASSWORD,
    email_confirm: true,
  })
  expect(error).toBeNull()
  studentId = data!.user!.id
  await admin
    .from('tenant_users')
    .insert({ tenant_id: DEFAULT_TENANT, user_id: studentId, role: 'student', status: 'active' })
    .throwOnError()

  const { data: tx } = await admin
    .from('transactions')
    .insert({
      user_id: studentId,
      product_id: PRODUCT_ID,
      tenant_id: DEFAULT_TENANT,
      amount: 29,
      currency: 'usd',
      status: 'successful',
      payment_provider: 'manual',
    })
    .select('transaction_id')
    .single()
    .throwOnError()
  transactionId = tx!.transaction_id

  const { data: pr } = await admin
    .from('payment_requests')
    .insert({
      user_id: studentId,
      product_id: PRODUCT_ID,
      tenant_id: DEFAULT_TENANT,
      contact_name: 'QA Student',
      contact_email: STUDENT,
      payer_name: 'QA Payer',
      status: 'pending',
    })
    .select('request_id')
    .single()
    .throwOnError()
  requestId = pr!.request_id
})

test.afterAll(async () => {
  if (transactionId) await admin.from('transactions').delete().eq('transaction_id', transactionId)
  if (requestId) await admin.from('payment_requests').delete().eq('request_id', requestId)
  if (studentId) await admin.auth.admin.deleteUser(studentId).catch(() => undefined)
})

/** Fill a React-controlled input once it has hydrated. */
async function fillStable(field: Locator, value: string) {
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await field.page().waitForTimeout(500)
        return field.inputValue()
      },
      { timeout: 30_000 },
    )
    .toBe(value)
}

test('the API refuses an unauthenticated caller', async ({ request }) => {
  const anon = await request.post(`${BASE}/api/account/delete`, { data: { confirm: STUDENT } })
  expect(anon.status()).toBe(401)
})

test('a student deletes their account from the profile page', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page, STUDENT, PASSWORD, BASE)
  await page.goto(`${BASE}/${LOCALE}/dashboard/student/profile`, { waitUntil: 'domcontentloaded' })

  const trigger = page.getByRole('button', { name: /Delete account/ })
  await trigger.scrollIntoViewIfNeeded()
  await expect(async () => {
    await trigger.evaluate((el: HTMLElement) => el.click())
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })

  const dialog = page.getByRole('alertdialog')
  const confirm = dialog.getByRole('button', { name: 'Delete my account' })
  await expect(confirm).toBeDisabled()
  await fillStable(dialog.getByLabel(`Type ${STUDENT} to confirm`), STUDENT)
  await expect(confirm).toBeEnabled()
  await confirm.evaluate((el: HTMLElement) => el.click())

  await page.waitForURL(/\/delete-account\?deleted=1/, { timeout: 60_000 })
  await expect(page.getByText('Your account has been deleted.')).toBeVisible()

  const { data: gone } = await admin.auth.admin.getUserById(studentId!)
  expect(gone?.user ?? null).toBeNull()
  const { count: profiles } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('id', studentId!)
  expect(profiles).toBe(0)

  const { data: tx } = await admin
    .from('transactions')
    .select('user_id, status')
    .eq('transaction_id', transactionId!)
    .single()
  expect(tx).toEqual({ user_id: null, status: 'successful' })

  const { data: pr } = await admin
    .from('payment_requests')
    .select('user_id, status, contact_email, payer_name')
    .eq('request_id', requestId!)
    .single()
  expect(pr).toEqual({ user_id: null, status: 'cancelled', contact_email: '', payer_name: null })
  studentId = null
})

test('the only admin of a school is told why they cannot delete yet', async ({ page, request }) => {
  test.setTimeout(120_000)
  await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, TENANT_BASE)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/settings`, { waitUntil: 'domcontentloaded' })

  const trigger = page.getByRole('button', { name: /Delete account/ })
  await trigger.scrollIntoViewIfNeeded()
  await expect(async () => {
    await trigger.evaluate((el: HTMLElement) => el.click())
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })

  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText("You can't delete your account yet")).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText(/You're the only admin of/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Delete my account' })).toHaveCount(0)

  // Cookie alone is refused (#891); with a token it reaches the blocker check.
  const cookieOnly = await page.request.post(`${TENANT_BASE}/api/account/delete`, {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({ confirm: ACCOUNTS.admin.email }),
  })
  expect(cookieOnly.status()).toBe(401)

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { data: signed } = await anon.auth.signInWithPassword({
    email: ACCOUNTS.admin.email,
    password: ACCOUNTS.admin.password,
  })
  const res = await request.post(`${TENANT_BASE}/api/account/delete`, {
    headers: { Authorization: `Bearer ${signed.session!.access_token}` },
    data: { confirm: ACCOUNTS.admin.email },
  })
  expect(res.status()).toBe(409)
})

test('the public page explains deletion to a logged-out visitor', async ({ page }) => {
  await page.goto(`${BASE}/${LOCALE}/delete-account`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Delete your account', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What is kept' })).toBeVisible()
})
