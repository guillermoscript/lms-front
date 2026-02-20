import { test } from '@playwright/test'
import { ACCOUNTS, BASE, LOCALE, PAUSE } from './utils/demo-constants'
import {
  cinematicLogin,
  cinematicScroll,
  cinematicType,
  cinematicClickText,
  cinematicClick,
  navigateAndSettle,
  spotlightHover,
  waitForTestId,
} from './utils/demo-helpers'

test('Teacher Content Creation — "Create courses in minutes"', async ({ page }) => {
  // --- Scene 1: Login as teacher/owner ---
  await cinematicLogin(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password)

  // --- Scene 2: Teacher Dashboard overview (now with real stats) ---
  await waitForTestId(page, 'teacher-dashboard')
  await page.waitForTimeout(PAUSE.ABSORB)

  // Hover over stat cards showing real student/course counts
  const statCards = await page.locator('[data-testid*="stat"], .stat-card, [class*="card"]').all()
  for (const card of statCards.slice(0, 4)) {
    if (await card.isVisible().catch(() => false)) {
      await card.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
    }
  }

  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 400, 3)

  // --- Scene 3: Navigate to courses list ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/dashboard/teacher/courses`)
  await waitForTestId(page, 'teacher-courses-list')
  await page.waitForTimeout(PAUSE.ABSORB)

  // Show the existing courses list (now 5 courses!)
  await cinematicScroll(page, 'down', 300, 2)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 300, 2)

  // --- Scene 4: Create a new course ---
  const createBtn = page.getByRole('link', { name: /create|new|add/i })
    .or(page.getByRole('button', { name: /create|new|add/i }))
    .first()
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.scrollIntoViewIfNeeded()
    await createBtn.hover()
    await page.waitForTimeout(400)
    await createBtn.click()
    await page.waitForTimeout(PAUSE.ABSORB)

    // Type course title
    const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], [data-testid="course-title"]').first()
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleInput.click()
      await titleInput.pressSequentially('Introduction to Web Development', { delay: 60 })
      await page.waitForTimeout(PAUSE.GLANCE)
    }

    // Type course description
    const descInput = page.locator('textarea[name="description"], textarea[placeholder*="description" i], [data-testid="course-description"]').first()
    if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descInput.click()
      await descInput.pressSequentially(
        'Learn HTML, CSS, and JavaScript from scratch. Build real projects and launch your career.',
        { delay: 40 }
      )
      await page.waitForTimeout(PAUSE.READ)
    }

    await page.waitForTimeout(PAUSE.ABSORB)
  }

  // --- Scene 5: View an existing course (content structure) ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/dashboard/teacher/courses`)
  await page.waitForTimeout(PAUSE.READ)

  const courseRow = page.locator('a[href*="/courses/"], tr[data-testid], [data-testid="course-card"]').first()
  if (await courseRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await courseRow.hover()
    await page.waitForTimeout(400)
    await courseRow.click()
    await page.waitForTimeout(PAUSE.ABSORB)
    await cinematicScroll(page, 'down', 500, 3)
    await page.waitForTimeout(PAUSE.READ)
  }

  // --- Scene 6: Revenue page (now with real transactions) ---
  const revenueLink = page.getByRole('link', { name: /revenue|analytics|earnings/i }).first()
  if (await revenueLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await revenueLink.hover()
    await page.waitForTimeout(400)
    await revenueLink.click()
    await page.waitForTimeout(PAUSE.ABSORB)
    await cinematicScroll(page, 'down', 400, 3)
  }

  await page.waitForTimeout(PAUSE.LINGER)
})
