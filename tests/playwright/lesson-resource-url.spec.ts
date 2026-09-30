/**
 * Signed lesson-resource downloads over Bearer — issue #848.
 *
 * The native app can list a lesson's resources but had no way to open one:
 * the web signs them in a server action. `GET
 * /api/lessons/:lessonId/resources/:resourceId/url` signs one for a Bearer
 * caller, behind the same gate as the action: resource in the token's school
 * and in the named lesson, caller is the course author, a school admin, or
 * holds course access. The proof it works is downloading the file it names.
 *
 * Seeds its own files in the private `lesson-resources` bucket — one on a
 * Code Academy lesson (course 2001, which alice holds), one on a Default
 * School lesson — plus a Code Academy student with no entitlement. All removed
 * afterwards.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BASE, TENANT_BASE } from './utils/constants'
import { loginAsTenantStudent } from './utils/auth'
import { SEEDED, getAdmin } from './utils/plan-gate-fixtures'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const DEFAULT_SCHOOL = '00000000-0000-0000-0000-000000000001'
const CREATOR = { email: 'creator@codeacademy.com', password: 'password123' }
const NO_ACCESS = { email: 'e2e-848-no-access@e2etest.com', password: 'password123' }

const CA_LESSON = 2001 // course 2001, authored by creator; alice holds it
const DEFAULT_LESSON = 1001 // course 1001, Default School
const BODY = 'week,topic\n1,e2e-848\n'
const CA_PATH = `${CODE_ACADEMY}/${CA_LESSON}/e2e-848.csv`
const DEFAULT_PATH = `${DEFAULT_SCHOOL}/${DEFAULT_LESSON}/e2e-848.csv`

let caResourceId = 0
let defaultResourceId = 0

function anon(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function bearer(account: { email: string; password: string }) {
  const { data, error } = await anon().auth.signInWithPassword(account)
  expect(error).toBeNull()
  return { Authorization: `Bearer ${data.session!.access_token}` }
}

const url = (lessonId: number, resourceId: number) =>
  `${BASE}/api/lessons/${lessonId}/resources/${resourceId}/url`

async function seedResource(admin: SupabaseClient, tenantId: string, lessonId: number, path: string) {
  const { error: uploadError } = await admin.storage
    .from('lesson-resources')
    .upload(path, new Blob([BODY], { type: 'text/csv' }), { contentType: 'text/csv', upsert: true })
  expect(uploadError).toBeNull()
  const { data, error } = await admin
    .from('lesson_resources')
    .insert({
      lesson_id: lessonId,
      tenant_id: tenantId,
      file_name: 'e2e-848.csv',
      file_path: path,
      file_size: BODY.length,
      mime_type: 'text/csv',
      display_order: 99,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as number
}

async function deleteNoAccessUser(admin: SupabaseClient) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = data?.users.find((u) => u.email === NO_ACCESS.email)
  if (!user) return
  await admin.from('gamification_profiles').delete().eq('user_id', user.id)
  await admin.from('tenant_users').delete().eq('user_id', user.id)
  await admin.auth.admin.deleteUser(user.id)
}

async function cleanup(admin: SupabaseClient) {
  await admin.from('lesson_resources').delete().in('file_path', [CA_PATH, DEFAULT_PATH])
  await admin.storage.from('lesson-resources').remove([CA_PATH, DEFAULT_PATH])
  await deleteNoAccessUser(admin)
}

test.describe('GET /api/lessons/:lessonId/resources/:resourceId/url (#848)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const admin = getAdmin()
    await cleanup(admin)
    caResourceId = await seedResource(admin, CODE_ACADEMY, CA_LESSON, CA_PATH)
    defaultResourceId = await seedResource(admin, DEFAULT_SCHOOL, DEFAULT_LESSON, DEFAULT_PATH)

    // A Code Academy student who holds no course: the token names the school,
    // the membership is real, only the entitlement is missing.
    const { data, error } = await admin.auth.admin.createUser({
      ...NO_ACCESS,
      email_confirm: true,
      app_metadata: { tenant_id: CODE_ACADEMY },
    })
    expect(error).toBeNull()
    const { error: memberError } = await admin
      .from('tenant_users')
      .upsert({ tenant_id: CODE_ACADEMY, user_id: data.user!.id, role: 'student', status: 'active' }, {
        onConflict: 'tenant_id,user_id',
      })
    expect(memberError).toBeNull()

    // Other specs move alice's claim; this one needs it on Code Academy.
    await admin.auth.admin.updateUserById(SEEDED.alice.id, {
      app_metadata: { tenant_id: CODE_ACADEMY },
      user_metadata: { preferred_tenant_id: CODE_ACADEMY },
    })
  })

  test.afterAll(async () => {
    await cleanup(getAdmin())
  })

  test('401 without a token', async ({ request }) => {
    expect((await request.get(url(CA_LESSON, caResourceId))).status()).toBe(401)
  })

  test('a student with course access gets a short-lived URL that downloads the file', async ({ request }) => {
    const res = await request.get(url(CA_LESSON, caResourceId), { headers: await bearer(SEEDED.alice) })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ fileName: 'e2e-848.csv', mimeType: 'text/csv' })
    expect(body.expiresIn).toBeGreaterThan(0)
    expect(body.expiresIn).toBeLessThanOrEqual(600)

    const file = await request.get(body.url)
    expect(file.status()).toBe(200)
    expect(await file.text()).toBe(BODY)
  })

  test('a student of the school without course access is refused', async ({ request }) => {
    const res = await request.get(url(CA_LESSON, caResourceId), { headers: await bearer(NO_ACCESS) })
    expect(res.status()).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'access_denied' })
    expect(JSON.stringify(await res.json())).not.toContain('token=')
  })

  test("another school's resource is a 404, even named under its real lesson", async ({ request }) => {
    const res = await request.get(url(DEFAULT_LESSON, defaultResourceId), { headers: await bearer(SEEDED.alice) })
    expect(res.status()).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'not_found' })
  })

  test('a resource named under the wrong lesson is a 404', async ({ request }) => {
    const res = await request.get(url(CA_LESSON + 1, caResourceId), { headers: await bearer(SEEDED.alice) })
    expect(res.status()).toBe(404)
  })

  test('the course author gets a URL without holding the course', async ({ request }) => {
    const res = await request.get(url(CA_LESSON, caResourceId), { headers: await bearer(CREATOR) })
    expect(res.status()).toBe(200)
    expect((await request.get((await res.json()).url)).status()).toBe(200)
  })

  test('the web lesson page still downloads through the shared gate', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/2001/lessons/${CA_LESSON}`, {
      waitUntil: 'domcontentloaded',
    })
    const row = page.locator('div.rounded-lg', { has: page.getByText('e2e-848.csv', { exact: true }) })
    await expect(row).toBeVisible({ timeout: 60_000 })
    // A CSV in a popup downloads instead of navigating, leaving nothing to
    // read the URL from — capture what the page hands to window.open.
    await page.evaluate(() => {
      const w = window as unknown as { __opened: string[] }
      w.__opened = []
      window.open = (u?: string | URL) => (w.__opened.push(String(u)), null)
    })
    // A click before hydration has no handler, and base-ui Buttons can swallow
    // Playwright clicks: fire the DOM click until the page hands over a URL.
    const button = row.getByRole('button')
    await expect
      .poll(
        async () => {
          const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened[0] ?? '')
          if (!opened) await button.evaluate((b) => (b as HTMLButtonElement).click())
          return opened
        },
        { timeout: 60_000, intervals: [1000, 2000, 3000] }
      )
      .toContain('e2e-848.csv')
    const signedUrl = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened[0])
    const file = await page.request.get(signedUrl)
    expect(file.status()).toBe(200)
    expect(await file.text()).toBe(BODY)
  })
})
