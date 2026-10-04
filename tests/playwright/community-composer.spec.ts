/**
 * Community composer, editing, role filter and school switches (#860).
 *
 *   media     an attached image reaches the post (it used to be dropped)
 *   polls     a student creates a poll from the composer
 *   edit      an author edits their own post
 *   filter    "By teachers" hides student posts
 *   settings  an admin closes the school feed to students; the composer goes;
 *             student polls off → no poll button
 *   paging    infinite scroll reaches every post once, school and course feed
 *   teacher   the teacher course feed renders the same posts
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
const COURSE_ID = 2001 // Python for Beginners — alice has access (seed)
const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const TEACHER_COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/community`
const PAGED = 25 // > one page of 20

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

  await box.getByRole('button', { name: 'Poll', exact: true }).click()
  const question = `${MARK} favourite language?`
  await box.getByRole('textbox', { name: 'Question' }).fill(question)
  await box.getByRole('textbox', { name: 'Option 1' }).fill('TypeScript')
  await box.getByRole('textbox', { name: 'Option 2' }).fill('Python')
  await box.getByRole('button', { name: /^Post/ }).click()

  await expect.poll(async () => (await findPost(question))[0]?.post_type, { timeout: 20_000 }).toBe('poll')
  const [poll] = await findPost(question)
  const { data: options } = await admin().from('community_poll_options').select('option_text').eq('post_id', poll.id).order('sort_order')
  expect(options?.map((o) => o.option_text)).toEqual(['TypeScript', 'Python'])
  const pollCard = page.locator('div.rounded-xl', { hasText: question }).last()
  await pollCard.getByRole('button', { name: 'TypeScript' }).evaluate((el: HTMLElement) => el.click())
  await expect(pollCard.getByText('100%')).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => {
      const { data } = await admin().from('community_poll_options').select('vote_count').eq('post_id', poll.id).order('sort_order')
      return data?.map((o) => o.vote_count)
    }, { timeout: 20_000 })
    .toEqual([1, 0])
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

test('with student polls off the composer has no poll button', async ({ page }) => {
  test.setTimeout(90_000)
  await clearSettings()
  await admin().from('tenant_settings').insert({
    tenant_id: CODE_ACADEMY_TENANT,
    setting_key: 'community_student_polls',
    setting_value: { enabled: false },
  })
  await loginAsTenantStudent(page)
  await page.goto(COURSE_FEED)
  const box = await composer(page)
  await expect(box.getByRole('button', { name: 'Attach image' })).toBeVisible()
  await expect(box.getByRole('button', { name: 'Poll', exact: true })).toHaveCount(0)
  await clearSettings()
})

/** Seed `PAGED` posts older than anything else in the feed, newest first. */
async function seedPage(label: string, courseId: number | null) {
  const { data: alice } = await admin().from('profiles').select('id').eq('full_name', 'Alice Student').limit(1).single()
  const base = Date.parse('2020-01-01T00:00:00Z')
  const rows = Array.from({ length: PAGED }, (_, i) => ({
    tenant_id: CODE_ACADEMY_TENANT,
    author_id: alice!.id,
    course_id: courseId,
    content: `${MARK} ${label} #${String(i).padStart(2, '0')}`,
    created_at: new Date(base - i * 60_000).toISOString(),
  }))
  const { error } = await admin().from('community_posts').insert(rows)
  expect(error).toBeNull()
  return rows.map((r) => r.content)
}

async function scrollUntil(page: Page, text: string) {
  const target = page.getByText(text, { exact: true })
  for (let i = 0; i < 30 && !(await target.isVisible()); i++) {
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(500)
  }
  await expect(target).toBeVisible({ timeout: 10_000 })
}

for (const feed of [
  { name: 'school', url: STUDENT_FEED, courseId: null },
  { name: 'course', url: COURSE_FEED, courseId: COURSE_ID },
]) {
  test(`infinite scroll reaches every ${feed.name} post exactly once`, async ({ page }) => {
    test.setTimeout(120_000)
    const contents = await seedPage(`paged-${feed.name}`, feed.courseId)
    await loginAsTenantStudent(page)
    await page.goto(feed.url)
    await composer(page)

    await scrollUntil(page, contents[contents.length - 1])
    for (const content of contents) {
      await expect(page.getByText(content, { exact: true })).toHaveCount(1)
    }
    await expect(page.getByText("You've reached the end")).toBeVisible({ timeout: 20_000 })
  })
}

test('the teacher course feed shows the course posts', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsAdmin(page)
  await page.goto(TEACHER_COURSE_FEED)
  await composer(page)
  // Newest seeded course post is on the first page.
  await expect(page.getByText(`${MARK} paged-course #00`, { exact: true })).toBeVisible({ timeout: 20_000 })
})
