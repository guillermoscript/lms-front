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

test('Student Experience — "Look what your students get"', async ({ page }) => {
  // --- Scene 1: Login ---
  await cinematicLogin(page, ACCOUNTS.student.email, ACCOUNTS.student.password)

  // --- Scene 2: Student Dashboard ---
  await waitForTestId(page, 'student-dashboard')
  await page.waitForTimeout(PAUSE.ABSORB)

  // Hover over stat cards to showcase populated data
  const statCards = await page.locator('[data-testid*="stat"], .stat-card, [class*="card"]').all()
  for (const card of statCards.slice(0, 4)) {
    if (await card.isVisible().catch(() => false)) {
      await card.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
    }
  }

  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 3: Browse enrolled courses ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/dashboard/student/courses`)
  await waitForTestId(page, 'student-courses-page')
  await page.waitForTimeout(PAUSE.ABSORB)

  // Click into a specific course (Intro to Testing — course 1001)
  const courseLink = page.locator('[data-testid="course-link-1001"], a[href*="/courses/1001"]').first()
  if (await courseLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await courseLink.scrollIntoViewIfNeeded()
    await courseLink.hover()
    await page.waitForTimeout(PAUSE.GLANCE)
    await courseLink.click()
    await page.waitForTimeout(PAUSE.ABSORB)

    // --- Scene 4: Enter a lesson ---
    const lessonLink = page.locator('a[href*="/lessons/"]').first()
    if (await lessonLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lessonLink.scrollIntoViewIfNeeded()
      await lessonLink.hover()
      await page.waitForTimeout(400)
      await lessonLink.click()
      await page.waitForTimeout(PAUSE.ABSORB)

      // Scroll through lesson content
      await cinematicScroll(page, 'down', 800, 5)
      await page.waitForTimeout(PAUSE.READ)

      // Try to mark lesson as complete
      const completeBtn = page.locator('[data-testid="lesson-complete-toggle"]')
        .or(page.getByRole('button', { name: /complete|mark/i })).first()
      if (await completeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await completeBtn.scrollIntoViewIfNeeded()
        await completeBtn.hover()
        await page.waitForTimeout(400)
        await completeBtn.click()
        await page.waitForTimeout(PAUSE.ABSORB)
      }
    }
  } else {
    // Fallback: click any visible course card
    const courseCard = page.locator('[data-testid="course-card"], a[href*="/courses/"]').first()
    if (await courseCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await courseCard.scrollIntoViewIfNeeded()
      await courseCard.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
      await courseCard.click()
      await page.waitForTimeout(PAUSE.ABSORB)
      await cinematicScroll(page, 'down', 600, 4)
      await page.waitForTimeout(PAUSE.READ)
    }
  }

  // --- Scene 5: Back to dashboard — progress / achievements ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/dashboard/student`)
  await waitForTestId(page, 'student-dashboard')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 600, 4)
  await page.waitForTimeout(PAUSE.LINGER)
})
