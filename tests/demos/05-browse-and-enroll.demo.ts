import { test } from '@playwright/test'
import { ACCOUNTS, BASE, LOCALE, PAUSE } from './utils/demo-constants'
import {
  cinematicLogin,
  cinematicScroll,
  cinematicClickText,
  navigateAndSettle,
  spotlightHover,
  waitForTestId,
} from './utils/demo-helpers'

test('Browse & Enroll — "Seamless enrollment experience"', async ({ page }) => {
  // --- Scene 1: Public pricing page (no login needed) ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/pricing`)
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 500, 3)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 500, 3)

  // --- Scene 2: Public courses catalog (now 5 courses) ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/courses`)
  await page.waitForTimeout(PAUSE.ABSORB)

  // Hover over course cards to show interactivity
  const courseCards = await page.locator('[data-testid="course-card"], a[href*="/courses/"]').all()
  for (const card of courseCards.slice(0, 4)) {
    if (await card.isVisible().catch(() => false)) {
      await card.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
    }
  }

  // --- Scene 3: Click into a course detail page ---
  const firstCourse = page.locator('[data-testid="course-card"], a[href*="/courses/"]').first()
  if (await firstCourse.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstCourse.click()
    await page.waitForTimeout(PAUSE.ABSORB)

    // Scroll through "What You'll Learn" + lessons list
    await cinematicScroll(page, 'down', 600, 4)
    await page.waitForTimeout(PAUSE.READ)
    await cinematicScroll(page, 'down', 400, 3)
    await page.waitForTimeout(PAUSE.READ)
    await cinematicScroll(page, 'up', 1000, 5)
  }

  // --- Scene 4: Login as student ---
  await cinematicLogin(page, ACCOUNTS.student.email, ACCOUNTS.student.password)

  // --- Scene 5: Browse courses as logged-in student (enroll buttons visible) ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/dashboard/student/courses`)
  await waitForTestId(page, 'student-courses-page')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)

  // Hover over enroll buttons if visible
  const enrollBtns = await page.getByRole('button', { name: /enroll|buy|purchase/i }).all()
  for (const btn of enrollBtns.slice(0, 2)) {
    if (await btn.isVisible().catch(() => false)) {
      await btn.scrollIntoViewIfNeeded()
      await btn.hover()
      await page.waitForTimeout(PAUSE.READ)
    }
  }

  await page.waitForTimeout(PAUSE.LINGER)
})
