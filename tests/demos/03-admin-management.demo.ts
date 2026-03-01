import { test } from '@playwright/test'
import { ACCOUNTS, LOCALE, PAUSE, TENANT_BASE } from './utils/demo-constants'
import {
  cinematicLogin,
  cinematicScroll,
  navigateAndSettle,
  spotlightHover,
  waitForTestId,
} from './utils/demo-helpers'

test('Admin Management — "Run your school like a business"', async ({ page }) => {
  // --- Scene 1: Login as admin on Code Academy ---
  await cinematicLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, TENANT_BASE)

  // --- Scene 2: Admin Dashboard stats (now with real revenue, user counts) ---
  await waitForTestId(page, 'admin-dashboard')
  await page.waitForTimeout(PAUSE.ABSORB)

  // Hover over the stats grid to showcase populated numbers
  const statsGrid = page.locator('[data-testid="admin-stats-grid"]').first()
  if (await statsGrid.isVisible({ timeout: 3000 }).catch(() => false)) {
    const statCards = await statsGrid.locator('[data-testid*="stat"], [class*="card"]').all()
    for (const card of statCards.slice(0, 4)) {
      if (await card.isVisible().catch(() => false)) {
        await card.hover()
        await page.waitForTimeout(PAUSE.GLANCE)
      }
    }
  } else {
    // Fallback: hover any card-like elements
    const cards = await page.locator('[data-testid*="stat"], .stat-card, [class*="card"]').all()
    for (const card of cards.slice(0, 4)) {
      if (await card.isVisible().catch(() => false)) {
        await card.hover()
        await page.waitForTimeout(PAUSE.GLANCE)
      }
    }
  }

  await cinematicScroll(page, 'down', 400, 3)
  await page.waitForTimeout(PAUSE.READ)
  await cinematicScroll(page, 'up', 400, 3)

  // --- Scene 3: Users list (now populated with students) ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/dashboard/admin/users`)
  await waitForTestId(page, 'users-page')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 300, 2)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 4: Products ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/dashboard/admin/products`)
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 300, 2)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 5: Transactions (now with real revenue and status badges) ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/dashboard/admin/transactions`)
  await waitForTestId(page, 'transactions-page')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 300, 2)
  await page.waitForTimeout(PAUSE.READ)

  // --- Scene 6: Analytics (charts with actual data) ---
  await navigateAndSettle(page, `${TENANT_BASE}/${LOCALE}/dashboard/admin/analytics`)
  await waitForTestId(page, 'analytics-page')
  await page.waitForTimeout(PAUSE.ABSORB)
  await cinematicScroll(page, 'down', 600, 4)
  await page.waitForTimeout(PAUSE.LINGER)
})
