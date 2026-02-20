import { test } from '@playwright/test'
import { ACCOUNTS, BASE, LOCALE, PAUSE, TENANT_BASE } from './utils/demo-constants'
import {
  cinematicLogin,
  cinematicScroll,
  navigateAndSettle,
  waitForTestId,
} from './utils/demo-helpers'

test('Multi-Tenant Platform — "Every school gets its own space"', async ({ page }) => {
  // --- Scene 1: Default School — public courses (now 5 courses!) ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/courses`)
  await page.waitForTimeout(PAUSE.ABSORB)

  // Hover over course cards
  const defaultCourses = await page.locator('[data-testid="course-card"], a[href*="/courses/"]').all()
  for (const card of defaultCourses.slice(0, 3)) {
    if (await card.isVisible().catch(() => false)) {
      await card.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
    }
  }

  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 400, 3)

  // --- Scene 2: Default School — pricing ---
  await navigateAndSettle(page, `${BASE}/${LOCALE}/pricing`)
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 3: Switch to Code Academy (different subdomain, 4 courses) ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/courses`)
  await page.waitForTimeout(PAUSE.ABSORB)

  const caCourses = await page.locator('[data-testid="course-card"], a[href*="/courses/"]').all()
  for (const card of caCourses.slice(0, 3)) {
    if (await card.isVisible().catch(() => false)) {
      await card.hover()
      await page.waitForTimeout(PAUSE.GLANCE)
    }
  }

  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 400, 3)

  // --- Scene 4: Code Academy — pricing (different products/plans) ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/pricing`)
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 5: Login as Code Academy student — dashboard with progress ---
  await cinematicLogin(
    page,
    ACCOUNTS.tenantStudent.email,
    ACCOUNTS.tenantStudent.password,
    TENANT_BASE
  )
  await waitForTestId(page, 'student-dashboard')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.LINGER)
})
