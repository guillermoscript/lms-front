/**
 * Free preview lessons — what a visitor with no account can actually read (#791).
 *
 * `is_preview` shipped complete in #426 and was set on 1 lesson in 83 in
 * production: nothing defaulted to it, nothing advertised it, and the preview
 * page itself was a dead end. These tests pin the three surfaces that make it
 * reachable — the catalog badge and filter, the curriculum link, and the
 * preview page's onward step — and the boundary that keeps it honest: a lesson
 * that is NOT a preview must 404 for a logged-out visitor, not render.
 *
 * Fixture over seed: two courses created here, one with previews and one
 * without, so the filter has something to exclude no matter what the seed says.
 */

import { test, expect } from '@playwright/test'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { loginAsAdmin } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

const RUN = Date.now()
const PREVIEW_COURSE = `[E2E] #791 Course with previews ${RUN}`
const LOCKED_COURSE = `[E2E] #791 Course without previews ${RUN}`
/** creator@codeacademy.com — the Code Academy admin the seed creates. */
const AUTHOR_ID = 'a1000000-0000-0000-0000-000000000003'

let previewCourseId: number
let lockedCourseId: number
let firstPreviewId: number
let secondPreviewId: number
let lockedLessonId: number

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const admin = getServiceRoleClient()

  const { data: courses, error: courseError } = await admin
    .from('courses')
    .insert([
      { title: PREVIEW_COURSE, description: 'Two open lessons, one members only.', status: 'published', tenant_id: CODE_ACADEMY_TENANT, author_id: AUTHOR_ID },
      { title: LOCKED_COURSE, description: 'Nothing readable without an account.', status: 'published', tenant_id: CODE_ACADEMY_TENANT, author_id: AUTHOR_ID },
    ])
    .select('course_id, title')
  if (courseError || !courses) throw new Error(`seed courses: ${courseError?.message ?? 'no rows'}`)

  previewCourseId = courses.find((c) => c.title === PREVIEW_COURSE)!.course_id
  lockedCourseId = courses.find((c) => c.title === LOCKED_COURSE)!.course_id

  const { data: lessons, error: lessonError } = await admin
    .from('lessons')
    .insert([
      { course_id: previewCourseId, tenant_id: CODE_ACADEMY_TENANT, title: 'Free lesson one', content: '# Free lesson one\n\nAnyone can read this.', sequence: 1, status: 'published', is_preview: true },
      { course_id: previewCourseId, tenant_id: CODE_ACADEMY_TENANT, title: 'Free lesson two', content: '# Free lesson two\n\nStill free.', sequence: 2, status: 'published', is_preview: true },
      { course_id: previewCourseId, tenant_id: CODE_ACADEMY_TENANT, title: 'Members only lesson', content: '# Members only\n\nSecret.', sequence: 3, status: 'published', is_preview: false },
      { course_id: lockedCourseId, tenant_id: CODE_ACADEMY_TENANT, title: 'Nothing free here', content: '# Locked', sequence: 1, status: 'published', is_preview: false },
    ])
    .select('id, title')
  if (lessonError || !lessons) throw new Error(`seed lessons: ${lessonError?.message ?? 'no rows'}`)

  firstPreviewId = lessons.find((l) => l.title === 'Free lesson one')!.id
  secondPreviewId = lessons.find((l) => l.title === 'Free lesson two')!.id
  lockedLessonId = lessons.find((l) => l.title === 'Members only lesson')!.id
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  await admin.from('lessons').delete().in('course_id', [previewCourseId, lockedCourseId])
  await admin.from('courses').delete().in('course_id', [previewCourseId, lockedCourseId])
})

test.describe('Free preview lessons (#791)', () => {
  test('the catalog says which courses can be started without an account', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`${TENANT_BASE}/${LOCALE}/courses?search=%23791`, { waitUntil: 'domcontentloaded' })

    const withPreviews = page.getByRole('link', { name: new RegExp(PREVIEW_COURSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    await expect(withPreviews).toBeVisible({ timeout: 60_000 })
    await expect(withPreviews.getByText('Free lesson', { exact: true })).toBeVisible()

    // The course with nothing free is listed too — until the filter is on.
    await expect(page.getByText(LOCKED_COURSE)).toBeVisible()

    await page.getByRole('button', { name: 'Free to start' }).click()
    await page.waitForURL(/preview=1/, { timeout: 30_000 })
    await expect(page.getByText(PREVIEW_COURSE)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(LOCKED_COURSE)).toHaveCount(0)
  })

  test('a logged-out visitor reads the preview lessons and is offered the next one', async ({ page }) => {
    // A dev server cold-compiles the course and lesson routes on first visit.
    test.setTimeout(240_000)

    await page.goto(`${TENANT_BASE}/${LOCALE}/courses/${previewCourseId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: PREVIEW_COURSE })).toBeVisible({ timeout: 120_000 })

    // The curriculum is behind the "All Lessons" accordion, closed on arrival.
    await page.getByRole('button', { name: /All Lessons/ }).click()

    // It links only the free lessons; the rest are plain rows.
    const freeOne = page.getByRole('link', { name: /Free lesson one/ })
    await expect(freeOne).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('link', { name: /Members only lesson/ })).toHaveCount(0)

    await freeOne.click()
    await page.waitForURL(new RegExp(`/courses/${previewCourseId}/lessons/${firstPreviewId}`), { timeout: 60_000 })
    // Two h1s on purpose: the page header and the lesson's own MDX title.
    await expect(page.locator('header').getByRole('heading', { name: 'Free lesson one' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Anyone can read this.')).toBeVisible()

    // The onward step: the second free lesson, not a bounce back to the course.
    const next = page.getByRole('link', { name: /Free lesson two/ })
    await expect(next).toBeVisible()
    await next.click()
    await page.waitForURL(new RegExp(`/courses/${previewCourseId}/lessons/${secondPreviewId}`), { timeout: 60_000 })
    await expect(page.locator('header').getByRole('heading', { name: 'Free lesson two' })).toBeVisible({ timeout: 30_000 })

    // Last free lesson: no next link, and the CTA starts an account carrying
    // this course as the destination.
    await expect(page.getByRole('link', { name: /Free lesson one/ })).toHaveCount(0)
    const cta = page.getByTestId('preview-enroll-cta')
    await expect(cta).toBeVisible()
    const href = await cta.locator('xpath=ancestor::a[1]').getAttribute('href')
    expect(href).toContain('/auth/sign-up')
    expect(decodeURIComponent(href ?? '')).toContain(`/courses/${previewCourseId}`)
  })

  test('a teacher makes a lesson free from the course lesson list', async ({ page }) => {
    // The switch used to live only inside the lesson editor's Details step, so
    // freeing three lessons meant opening and saving three editors.
    test.setTimeout(240_000)
    const admin = getServiceRoleClient()

    await loginAsAdmin(page, TENANT_BASE)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${previewCourseId}`, {
      waitUntil: 'domcontentloaded',
    })

    const toggle = page.getByRole('switch', { name: 'Free preview for Members only lesson' })
    await expect(toggle).toBeVisible({ timeout: 120_000 })
    // base-ui control: a real DOM click, not Playwright's synthesized one.
    await toggle.evaluate((el) => (el as HTMLElement).click())

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('lessons')
            .select('is_preview')
            .eq('id', lockedLessonId)
            .single()
          return data?.is_preview ?? null
        },
        { timeout: 30_000, intervals: [500, 1000] }
      )
      .toBe(true)

    // And the row it opens: the lesson is now readable with no account at all.
    const anon = await page.context().browser()!.newContext()
    const anonPage = await anon.newPage()
    await anonPage.goto(
      `${TENANT_BASE}/${LOCALE}/courses/${previewCourseId}/lessons/${lockedLessonId}`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(anonPage.getByText('Secret.')).toBeVisible({ timeout: 60_000 })
    await anon.close()

    // Put it back so the logged-out test below still has a shut door.
    const { error } = await admin
      .from('lessons')
      .update({ is_preview: false })
      .eq('id', lockedLessonId)
    expect(error).toBeNull()
  })

  test('a lesson that is not a preview stays shut for a logged-out visitor', async ({ page }) => {
    await page.goto(
      `${TENANT_BASE}/${LOCALE}/courses/${previewCourseId}/lessons/${lockedLessonId}`,
      { waitUntil: 'domcontentloaded' }
    )
    // The property is that the body never reaches the page — asserted on the
    // content rather than the status code, which a streamed response has
    // already committed as 200 before `notFound()` throws.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Secret.')).toHaveCount(0)
  })
})
