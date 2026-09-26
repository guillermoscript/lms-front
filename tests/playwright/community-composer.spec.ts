/**
 * Community composer, editing, role filter and school switches (#860).
 *
 *   media     an attached image reaches the post (it used to be dropped)
 *   polls     a student creates a poll from the composer
 *   edit      an author edits their own post
 *   filter    "By teachers" hides student posts
 *   settings  an admin closes the school feed to students; the composer goes
 *
 * Runs on Code Academy (community enabled). Every post carries MARK and is
 * removed afterwards; the settings rows are removed so the school is back on
 * the "missing row = ON" default.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE, LOCALE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const MARK = `[E2E-860 ${Date.now()}]`
const STUDENT_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/community`
const ADMIN_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/admin/community`

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function findPost(fragment: string) {
  const { data } = await admin()
    .from('community_posts')
    .select('id, post_type, title, content, media_urls')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .or(`content.ilike.%${fragment}%,title.ilike.%${fragment}%`)
  return data ?? []
}

async function clearSettings() {
  await admin()
    .from('tenant_settings')
    .delete()
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .in('setting_key', ['community_student_posts_school_feed', 'community_student_polls'])
}

async function composer(page: Page) {
  const box = page.locator('[data-tour="community-composer"]')
  await expect(box).toBeVisible({ timeout: 20_000 })
  return box
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(clearSettings)

test.afterAll(async () => {
  await clearSettings()
  const { data } = await admin()
    .from('community_posts')
    .select('id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .or(`content.ilike.%${MARK}%,title.ilike.%${MARK}%`)
  const ids = (data ?? []).map((p) => p.id)
  if (ids.length) await admin().from('community_posts').delete().in('id', ids)
})

test('an attached image is published with the post', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsTenantStudent(page)
  await page.goto(STUDENT_FEED)
  const box = await composer(page)

  await box.locator('input[type="file"]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG })
  await expect(box.locator('img[alt="pixel.png"]')).toBeVisible({ timeout: 20_000 })

  const text = `${MARK} with image`
  await box.getByRole('textbox', { name: "What's on your mind?" }).fill(text)
  await box.getByRole('button', { name: /^Post/ }).click()

  await expect.poll(async () => (await findPost(text))[0]?.media_urls, { timeout: 20_000 }).toHaveLength(1)
  const card = page.locator('div.rounded-xl', { hasText: text }).last()
  await expect(card.locator('img[alt="pixel.png"]')).toBeVisible({ timeout: 20_000 })
})

test('a student creates a poll from the composer', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsTenantStudent(page)
  await page.goto(STUDENT_FEED)
  const box = await composer(page)

  await box.getByRole('button', { name: 'Polls' }).click()
  const question = `${MARK} favourite language?`
  await box.getByRole('textbox', { name: 'Question' }).fill(question)
  await box.getByRole('textbox', { name: 'Option 1' }).fill('TypeScript')
  await box.getByRole('textbox', { name: 'Option 2' }).fill('Python')
  await box.getByRole('button', { name: /^Post/ }).click()

  await expect.poll(async () => (await findPost(question))[0]?.post_type, { timeout: 20_000 }).toBe('poll')
  const [poll] = await findPost(question)
  const { data: options } = await admin().from('community_poll_options').select('option_text').eq('post_id', poll.id).order('sort_order')
  expect(options?.map((o) => o.option_text)).toEqual(['TypeScript', 'Python'])
  await expect(page.getByText('TypeScript').first()).toBeVisible({ timeout: 20_000 })
})

test('an author edits their own post', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsTenantStudent(page)
  await page.goto(STUDENT_FEED)
  const box = await composer(page)

  const original = `${MARK} before edit`
  await box.getByRole('textbox', { name: "What's on your mind?" }).fill(original)
  await box.getByRole('button', { name: /^Post/ }).click()
  const card = page.locator('div.rounded-xl', { hasText: original }).last()
  await expect(card).toBeVisible({ timeout: 20_000 })

  // base-ui menu triggers ignore Playwright's synthetic pointer sequence.
  await card.getByRole('button', { name: 'Post actions' }).evaluate((el: HTMLElement) => el.click())
  await page.getByRole('menuitem', { name: 'Edit Post' }).evaluate((el: HTMLElement) => el.click())
  const edited = `${MARK} after edit`
  // The card no longer matches `original` once the textarea holds the edit.
  await page.getByRole('textbox', { name: 'Edit Post' }).fill(edited)
  await page.getByRole('button', { name: 'Save' }).evaluate((el: HTMLElement) => el.click())

  await expect.poll(async () => (await findPost(edited)).length, { timeout: 20_000 }).toBe(1)
  await expect(page.getByText(edited)).toBeVisible({ timeout: 20_000 })
})

test('"By Teachers" hides student posts', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsTenantStudent(page)
  await page.goto(STUDENT_FEED)
  await composer(page)

  const studentPost = page.getByText(`${MARK} with image`)
  await expect(studentPost).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'By Teachers' }).click()
  await expect(studentPost).toBeHidden()
  await page.getByRole('button', { name: 'By Students' }).click()
  await expect(studentPost).toBeVisible()
})

test('an admin closes the school feed to students', async ({ browser }) => {
  test.setTimeout(120_000)
  const adminPage = await (await browser.newContext()).newPage()
  await loginAsAdmin(adminPage)
  await adminPage.goto(ADMIN_FEED)
  // The sidebar has its own "Settings"; base-ui triggers need a DOM click.
  await adminPage
    .locator('[data-tour="community-header"]')
    .getByRole('button', { name: 'Settings' })
    .evaluate((el: HTMLElement) => el.click())
  const toggle = adminPage.getByRole('switch', { name: 'Allow student posts in school feed' })
  await expect(toggle).toBeChecked({ timeout: 10_000 })
  await toggle.evaluate((el: HTMLElement) => el.click())

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('tenant_settings')
          .select('setting_value')
          .eq('tenant_id', CODE_ACADEMY_TENANT)
          .eq('setting_key', 'community_student_posts_school_feed')
          .maybeSingle()
        return (data?.setting_value as { enabled?: boolean } | null)?.enabled
      },
      { timeout: 20_000 }
    )
    .toBe(false)

  const studentPage = await (await browser.newContext()).newPage()
  await loginAsTenantStudent(studentPage)
  await studentPage.goto(STUDENT_FEED)
  await expect(studentPage.getByText('Only teachers and admins can post in the school feed')).toBeVisible({
    timeout: 20_000,
  })
  await expect(studentPage.locator('[data-tour="community-composer"]')).toHaveCount(0)
})
