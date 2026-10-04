import { test, expect, type Page } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'
import { getAdmin } from './utils/plan-gate-fixtures'

/**
 * #796 — Save Draft on `/exercises/new` created the exercise but kept deciding
 * create-vs-update from the (still undefined) `initialData` prop, so every
 * further Save Draft or Publish inserted another row.
 *
 * Seed: course 1001, teacher owner@e2etest.com. Each test uses its own title
 * and deletes its rows afterwards.
 */

const COURSE_ID = 1001
const NEW_URL = `${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/exercises/new`
const PREFIX = 'E2E #796 draft'

async function rowsTitled(title: string) {
  const { data, error } = await getAdmin()
    .from('exercises')
    .select('id, status')
    .eq('course_id', COURSE_ID)
    .eq('title', title)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function openNewExercise(page: Page, title: string) {
  await page.goto(NEW_URL)
  const titleInput = page.getByRole('textbox').first()
  await expect(titleInput).toBeVisible({ timeout: 30_000 })
  await titleInput.fill(title)
}

/** base-ui Buttons swallow Playwright's synthetic click now and then. */
async function clickButton(page: Page, name: RegExp, times = 1) {
  const btn = page.getByRole('button', { name })
  await expect(btn).toBeEnabled()
  await btn.evaluate((el, n) => {
    for (let i = 0; i < n; i++) (el as HTMLButtonElement).click()
  }, times)
}

test.describe('Exercise builder — Save Draft on a new exercise (#796)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test.afterAll(async () => {
    await getAdmin().from('exercises').delete().eq('course_id', COURSE_ID).like('title', `${PREFIX}%`)
  })

  test('Save Draft twice → one row, and the URL becomes the edit page', async ({ page }) => {
    test.setTimeout(90_000)
    const title = `${PREFIX} twice ${Date.now()}`
    await openNewExercise(page, title)

    await clickButton(page, /save draft/i)
    await expect(page).toHaveURL(/\/exercises\/\d+$/, { timeout: 30_000 })
    const [row] = await rowsTitled(title)
    expect(row).toBeDefined()
    expect(page.url()).toMatch(new RegExp(`/exercises/${row.id}$`))

    await expect(page.getByRole('button', { name: /save draft/i })).toBeEnabled({ timeout: 30_000 })
    await clickButton(page, /save draft/i)
    await expect(page.getByRole('button', { name: /save draft/i })).toBeEnabled({ timeout: 30_000 })

    const rows = await rowsTitled(title)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('draft')

    // A reload lands on the saved exercise, not a blank form.
    await page.reload()
    await expect(page.getByRole('textbox').first()).toHaveValue(title, { timeout: 30_000 })
  })

  test('Save Draft then Publish → one row, published', async ({ page }) => {
    test.setTimeout(90_000)
    const title = `${PREFIX} publish ${Date.now()}`
    await openNewExercise(page, title)

    await clickButton(page, /save draft/i)
    await expect(page).toHaveURL(/\/exercises\/\d+$/, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: /publish/i })).toBeEnabled({ timeout: 30_000 })

    await clickButton(page, /publish/i)
    await expect(page).toHaveURL(new RegExp(`/courses/${COURSE_ID}/exercises$`), { timeout: 30_000 })

    const rows = await rowsTitled(title)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('published')
  })

  test('a double click on Save Draft creates one row', async ({ page }) => {
    test.setTimeout(90_000)
    const title = `${PREFIX} double ${Date.now()}`
    await openNewExercise(page, title)

    await clickButton(page, /save draft/i, 2)
    await expect(page).toHaveURL(/\/exercises\/\d+$/, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: /save draft/i })).toBeEnabled({ timeout: 30_000 })

    expect(await rowsTitled(title)).toHaveLength(1)
  })
})
