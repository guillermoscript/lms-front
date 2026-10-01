/**
 * A school's country (#865).
 *
 *   1. /create-school pre-selects the country from the visitor's edge geo
 *      header, and the school is created with it: `tenants.country` is set and
 *      the country's currency becomes the `currency` setting.
 *   2. A new school saves Admin → Settings → General untouched (#890).
 *   3. Admin → Settings → General changes the country. A currency the school
 *      already has is kept; an empty one is filled from the new country.
 *
 * The run owns a fresh tenant + creator (`country865-<runId>`); `afterAll`
 * removes them and `beforeAll` sweeps whatever an aborted run left behind.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BASE } from './utils/constants'
import { getServiceRoleClient } from './utils/seed-state'
import { tenantBase } from './utils/plan-gate-fixtures'
import { login } from './utils/auth'

test.describe.configure({ mode: 'serial' })

const PASSWORD = 'password123'
const RUN_ID = Date.now().toString(36)
const PREFIX = 'country865-'
const STALE_AFTER_MS = 60 * 60 * 1000

const slug = `${PREFIX}${RUN_ID}`
const email = `${slug}@e2etest.com`
const schoolName = `Country 865 ${RUN_ID}`

// Same as an edge (Vercel) request from Colombia. The context header rides on
// every request, so the server component that renders /create-school sees it.
test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'CO' } })

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Fill controlled inputs once React has hydrated them (see loop-1 spec). */
async function fillAllStable(fields: Array<[Locator, string]>) {
  for (const [field] of fields) await field.waitFor({ state: 'visible', timeout: 30_000 })
  const page = fields[0][0].page()
  await expect
    .poll(
      () => fields[0][0].evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
      { timeout: 60_000, intervals: [250, 500, 1000] },
    )
    .toBe(true)
  await expect
    .poll(
      async () => {
        for (const [field, value] of fields) await field.fill(value)
        await page.waitForTimeout(500)
        const values = await Promise.all(fields.map(([field]) => field.inputValue()))
        return values.every((v, i) => v === fields[i][1])
      },
      { timeout: 45_000, intervals: [500, 1000] },
    )
    .toBe(true)
}

/** base-ui controls intermittently swallow a Playwright click; retry until `arrived`. */
async function clickUntil(target: Locator, arrived: () => Promise<boolean>, settleMs = 15_000) {
  const page = target.page()
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await arrived()) return
    await target.click().catch(() => undefined)
    const deadline = Date.now() + settleMs
    while (Date.now() < deadline) {
      if (await arrived()) return
      await page.waitForTimeout(250)
    }
  }
  expect(await arrived(), 'click never took').toBe(true)
}

/** Search the combobox and pick one country. */
async function pickCountry(page: Page, input: Locator, query: string, code: string, label: string) {
  await expect
    .poll(
      async () => {
        await input.click()
        await input.fill(query)
        const option = page.getByTestId(`country-option-${code}`)
        if (await option.isVisible().catch(() => false)) {
          await option.click().catch(() => undefined)
        }
        await page.waitForTimeout(300)
        return input.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] },
    )
    .toBe(label)
}

async function findUserId(admin: SupabaseClient, address: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 1000) return null
  }
}

async function destroy(admin: SupabaseClient, tenantSlug: string, address: string) {
  const { data: tenant } = await admin.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()
  if (tenant) {
    await admin.from('tenant_users').delete().eq('tenant_id', tenant.id)
    await admin.from('tenant_settings').delete().eq('tenant_id', tenant.id)
    await admin.from('tenants').delete().eq('id', tenant.id)
  }
  const userId = await findUserId(admin, address)
  if (userId) await admin.auth.admin.deleteUser(userId)
}

async function readSchool(admin: SupabaseClient) {
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('id, country')
    .eq('slug', slug)
    .single()
  if (error) throw new Error(`tenant: ${error.message}`)
  const { data: currency } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenant.id)
    .eq('setting_key', 'currency')
    .maybeSingle()
  return {
    id: tenant.id as string,
    country: tenant.country as string | null,
    currency: ((currency?.setting_value as { value?: string } | null)?.value ?? null) as string | null,
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data: stale } = await admin
    .from('tenants')
    .select('slug')
    .like('slug', `${PREFIX}%`)
    .lt('created_at', cutoff)
  for (const t of stale ?? []) {
    await destroy(admin, t.slug as string, `${t.slug}@e2etest.com`).catch(() => undefined)
  }
})

test.afterAll(async () => {
  await destroy(getServiceRoleClient(), slug, email)
})

test('create-school pre-selects the detected country and stores it with its currency', async ({ page }) => {
  test.setTimeout(300_000)
  const admin = getServiceRoleClient()

  await page.goto(`${BASE}/en/create-school`, { waitUntil: 'domcontentloaded' })
  await fillAllStable([
    [page.locator('#owner-name'), 'Country Creator'],
    [page.locator('#email'), email],
    [page.locator('#password'), PASSWORD],
  ])
  const schoolNameInput = page.getByTestId('create-school-name')
  await clickUntil(page.getByRole('button', { name: /create account/i }), () => schoolNameInput.isVisible(), 45_000)

  // Pre-selected from the geo header — no hardcoded default anywhere.
  const country = page.getByTestId('create-school-country')
  await expect(country).toHaveValue('Colombia')

  await fillAllStable([
    [schoolNameInput, schoolName],
    [page.getByTestId('create-school-slug'), slug],
  ])

  const hop = page.waitForRequest(
    (req) => req.isNavigationRequest() && new URL(req.url()).hostname.startsWith(`${slug}.`),
    { timeout: 45_000 },
  )
  await page.getByTestId('create-school-submit').click()
  await hop

  const school = await readSchool(admin)
  expect(school.country).toBe('CO')
  expect(school.currency).toBe('COP')
})

test('a new school saves General settings untouched (#890)', async ({ page }) => {
  test.setTimeout(180_000)
  const admin = getServiceRoleClient()
  await login(page, email, PASSWORD, tenantBase(slug))
  await page.goto(`${tenantBase(slug)}/en/dashboard/admin/settings`, { waitUntil: 'domcontentloaded' })

  const form = page.locator('form', { has: page.getByTestId('settings-country') })
  await expect(form.locator('#site_name')).toHaveValue(schoolName, { timeout: 30_000 })
  await expect(form.locator('#contact_email')).toHaveValue('')
  await expect(form.locator('#support_email')).toHaveValue('')

  const toast = page.getByText('Settings updated successfully').first()
  await clickUntil(form.getByRole('button', { name: /save changes/i }), () => toast.isVisible(), 20_000)

  const { id } = await readSchool(admin)
  const { data: rows } = await admin
    .from('tenant_settings')
    .select('setting_key, setting_value')
    .eq('tenant_id', id)
    .in('setting_key', ['site_name', 'contact_email', 'support_email'])
  const byKey = Object.fromEntries((rows ?? []).map((r) => [r.setting_key, (r.setting_value as { value?: unknown }).value]))
  expect(byKey.site_name).toBe(schoolName)
  expect(byKey.contact_email).toBeNull()
  expect(byKey.support_email).toBeNull()
})

test('an admin changes the country; a set currency is kept, an empty one is filled', async ({ page }) => {
  test.setTimeout(300_000)
  const admin = getServiceRoleClient()
  const settingsUrl = `${tenantBase(slug)}/en/dashboard/admin/settings`

  // Each test gets a fresh context: sign in on the school's own subdomain.
  await login(page, email, PASSWORD, tenantBase(slug))

  const save = async () => {
    const form = page.locator('form', { has: page.getByTestId('settings-country') })
    // Saved untouched (#890): a school made by create_school() has no stored
    // site name or emails; the form defaults the name to tenants.name and the
    // emails are optional, so nothing needs filling in.
    await expect(form.locator('#site_name')).toHaveValue(schoolName, { timeout: 30_000 })
    const toast = page.getByText('Settings updated successfully').first()
    await clickUntil(form.getByRole('button', { name: /save changes/i }), () => toast.isVisible(), 20_000)
  }

  await test.step('switch to Mexico: COP is the school\'s choice and stays', async () => {
    await page.goto(settingsUrl, { waitUntil: 'domcontentloaded' })
    const country = page.getByTestId('settings-country')
    await expect(country).toHaveValue('Colombia', { timeout: 30_000 })
    await pickCountry(page, country, 'Mexi', 'MX', 'Mexico')
    await save()

    await expect.poll(async () => (await readSchool(admin)).country, { timeout: 15_000 }).toBe('MX')
    expect((await readSchool(admin)).currency).toBe('COP')
  })

  await test.step('switch to Spain with no currency set: EUR is filled in', async () => {
    const { id } = await readSchool(admin)
    await admin.from('tenant_settings').delete().eq('tenant_id', id).eq('setting_key', 'currency')

    await page.goto(settingsUrl, { waitUntil: 'domcontentloaded' })
    const country = page.getByTestId('settings-country')
    await expect(country).toHaveValue('Mexico', { timeout: 30_000 })
    await pickCountry(page, country, 'Spai', 'ES', 'Spain')
    await save()
    await expect(page.getByText('Default currency set to EUR.')).toBeVisible()

    const school = await readSchool(admin)
    expect(school.country).toBe('ES')
    expect(school.currency).toBe('EUR')
  })
})
