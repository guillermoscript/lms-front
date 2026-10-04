/**
 * A tenant admin can manage courses they did not author (#690, part of #682).
 *
 * The course editor and the lesson create/edit pages used to be owner-only,
 * so a second admin of the same school (or an admin opening a course made by
 * a teacher / the AI generator under another account) got "Access denied"
 * where the settings page already let them through. This spec walks the
 * admin path end to end and pins the teacher path to what it always was:
 *
 *   1. A throwaway second admin of Code Academy opens "Python for Beginners"
 *      (course 2001, authored by creator@codeacademy.com): the editor renders.
 *   2. Adds a lesson through /lessons/new and publishes it: the row lands in
 *      `lessons` for course 2001.
 *   3. Opens that lesson's edit page, renames it, publishes again: the row
 *      carries the new title.
 *   4. A throwaway teacher of the same school opens the same course: the
 *      "Access denied" card; /lessons/new and the lesson edit page 404.
 *
 * Both accounts are created in `beforeAll` and removed in `afterAll`, along
 * with every lesson the run added, so the seeded data is never touched.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { login } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

test.describe.configure({ mode: 'serial' })

const PASSWORD = 'password123'
const COURSE_ID = 2001 // Python for Beginners, authored by creator@codeacademy.com
const RUN_ID = Date.now().toString(36)
const SECOND_ADMIN = `qa-690-admin-${RUN_ID}@e2etest.com`
const TEACHER = `qa-690-teacher-${RUN_ID}@e2etest.com`
const LESSON_TITLE = `QA #690 lesson ${RUN_ID}`
const RENAMED_TITLE = `QA #690 lesson ${RUN_ID} (edited)`
const LESSON_TEXT = 'A lesson added by a second admin who did not author the course.'

let admin: SupabaseClient
const userIds: string[] = []
let lessonId: number | null = null

async function createStaff(email: string, role: 'admin' | 'teacher') {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  expect(error, `create ${role} ${email}`).toBeNull()
  const id = data!.user!.id
  userIds.push(id)
  const { error: memberError } = await admin
    .from('tenant_users')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, user_id: id, role, status: 'active' })
  expect(memberError, `add ${role} to Code Academy`).toBeNull()
  return id
}

/**
 * Fill a React-controlled input and prove the value survived hydration —
 * the same trap `utils/auth.ts` documents for the login form.
 */
async function fillStable(field: Locator, value: string) {
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  const page = field.page()
  await expect
    .poll(() => field.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))), {
      timeout: 60_000,
      intervals: [250, 500, 1000],
    })
    .toBe(true)
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(750)
        return field.inputValue()
      },
      { timeout: 45_000, intervals: [500, 1000] },
    )
    .toBe(value)
}

/**
 * base-ui Buttons intermittently swallow a Playwright click; press again
 * until the page shows the expected result.
 */
async function clickUntil(
  button: Locator,
  arrived: () => Promise<boolean>,
  { attempts = 2, settleMs = 30_000 }: { attempts?: number; settleMs?: number } = {},
) {
  const page = button.page()
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await arrived()) return
    await button.click().catch(() => undefined)
    const deadline = Date.now() + settleMs
    while (Date.now() < deadline) {
      if (await arrived()) return
      await page.waitForTimeout(250)
    }
  }
  if (!(await arrived())) {
    throw new Error(`clicking ${await button.evaluate((el) => el.textContent?.trim())} never took`)
  }
}

/** Publishing a lesson returns to the course curriculum; wait for that hop. */
async function publishLesson(page: Page) {
  const backOnCourse = new RegExp(`/dashboard/teacher/courses/${COURSE_ID}$`)
  await clickUntil(
    page.getByRole('button', { name: /^publish$/i }),
    async () => backOnCourse.test(page.url()),
  )
  await expect(page).toHaveURL(backOnCourse, { timeout: 30_000 })
}

const courseUrl = `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}`

test.beforeAll(async () => {
  admin = getServiceRoleClient()
  await createStaff(SECOND_ADMIN, 'admin')
  await createStaff(TEACHER, 'teacher')
})

test.afterAll(async () => {
  await admin.from('lessons').delete().eq('course_id', COURSE_ID).like('title', `QA #690 lesson ${RUN_ID}%`)
  for (const id of userIds) {
    await admin.from('tenant_users').delete().eq('user_id', id)
    await admin.auth.admin.deleteUser(id)
  }
})

test('a second admin opens a course they did not author, adds a lesson and edits it', async ({ page }) => {
  // Two editor round-trips on a dev server that compiles routes on first hit.
  test.setTimeout(300_000)
  await login(page, SECOND_ADMIN, PASSWORD, TENANT_BASE)

  await test.step('1. the course editor renders instead of the Access denied card', async () => {
    await page.goto(courseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Python for Beginners' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Access denied')).toHaveCount(0)
  })

  await test.step('2. add a lesson through /lessons/new and publish it', async () => {
    await page.goto(`${courseUrl}/lessons/new`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Page not found')).toHaveCount(0)

    await fillStable(page.getByPlaceholder(/introduction to variables/i), LESSON_TITLE)
    const addBlock = page.getByRole('button', { name: /^add block$/i })
    await clickUntil(page.getByRole('button', { name: /write content/i }), () => addBlock.first().isVisible())
    const textOption = page.getByRole('button', { name: /^Text\b/ })
    await clickUntil(addBlock.first(), () => textOption.isVisible())
    const textArea = page.getByPlaceholder(/write your text here/i)
    await clickUntil(textOption, () => textArea.isVisible())
    await fillStable(textArea, LESSON_TEXT)

    await publishLesson(page)
    await expect(page.getByText(LESSON_TITLE)).toBeVisible({ timeout: 15_000 })

    const { data: lessons } = await admin
      .from('lessons')
      .select('id, title, status, content')
      .eq('course_id', COURSE_ID)
      .eq('title', LESSON_TITLE)
    expect(lessons).toHaveLength(1)
    expect(lessons![0].status).toBe('published')
    expect(lessons![0].content).toContain(LESSON_TEXT)
    lessonId = lessons![0].id
  })

  await test.step('3. open the lesson edit page, rename it, publish again', async () => {
    await page.goto(`${courseUrl}/lessons/${lessonId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Page not found')).toHaveCount(0)
    const title = page.getByPlaceholder(/introduction to variables/i)
    await expect(title).toHaveValue(LESSON_TITLE, { timeout: 30_000 })

    await fillStable(title, RENAMED_TITLE)
    await publishLesson(page)
    await expect(page.getByText(RENAMED_TITLE)).toBeVisible({ timeout: 15_000 })

    const { data: lesson } = await admin.from('lessons').select('title').eq('id', lessonId!).single()
    expect(lesson?.title).toBe(RENAMED_TITLE)
  })
})

test('a teacher still gets Access denied on someone else\'s course', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, TEACHER, PASSWORD, TENANT_BASE)

  await page.goto(courseUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Access denied')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Python for Beginners' })).toHaveCount(0)

  await page.goto(`${courseUrl}/lessons/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 30_000 })

  // The lesson the admin added above (falls back to a seeded lesson if that
  // test was skipped): still 404 for a non-author teacher.
  const { data: seeded } = await admin
    .from('lessons')
    .select('id')
    .eq('course_id', COURSE_ID)
    .order('sequence', { ascending: true })
    .limit(1)
    .single()
  await page.goto(`${courseUrl}/lessons/${lessonId ?? seeded!.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 30_000 })
})
