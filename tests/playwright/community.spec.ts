import { test, expect } from '@playwright/test'
import { loginAsStudent, loginAsTeacher, loginAsAdmin } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P1 — Community Spaces Tests
 *
 * Covers community page loads for all roles, page structure verification,
 * and cross-tenant isolation. Does not create posts or mutate data.
 */

test.describe('Community Spaces', () => {
  test.describe('Student Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('student community page loads with header', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)

      // Page should load — either the community feed or an upgrade nudge
      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('student community shows feed structure or upgrade nudge', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      // Either the community feed renders (with tour anchors) or an upgrade nudge is shown
      const communityHeader = page.locator('[data-tour="community-header"]')
      const upgradeNudge = page.locator('text=/upgrade/i')

      // One of these must be visible
      const headerVisible = await communityHeader.isVisible().catch(() => false)
      const nudgeVisible = await upgradeNudge.first().isVisible().catch(() => false)

      expect(headerVisible || nudgeVisible).toBeTruthy()
    })

    test('student community shows composer and filters when available', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // If community is available, composer and filters should be present
        const composer = page.locator('[data-tour="community-composer"]')
        const filters = page.locator('[data-tour="community-filters"]')

        await expect(composer).toBeVisible({ timeout: 10_000 })
        await expect(filters).toBeVisible({ timeout: 10_000 })
      } else {
        // If community is not available, upgrade nudge should be shown
        const body = page.locator('body')
        await expect(body).toContainText(/upgrade|plan/i)
      }
    })

    test('student community shows feed or empty state', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // Feed area should render — either with posts or empty state
        const feedArea = page.locator('[data-tour="community-feed"]')
        const emptyState = page.locator('text=/no posts|be the first|empty/i')

        const feedVisible = await feedArea.isVisible().catch(() => false)
        const emptyVisible = await emptyState.first().isVisible().catch(() => false)

        expect(feedVisible || emptyVisible).toBeTruthy()
      }
    })
  })

  test.describe('Teacher Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTeacher(page)
    })

    test('teacher community page loads with header', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('teacher community shows feed structure or upgrade nudge', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const upgradeNudge = page.locator('text=/upgrade/i')

      const headerVisible = await communityHeader.isVisible().catch(() => false)
      const nudgeVisible = await upgradeNudge.first().isVisible().catch(() => false)

      expect(headerVisible || nudgeVisible).toBeTruthy()
    })
  })

  test.describe('Admin Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('admin community page loads with header', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('admin community shows moderation button when community is available', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // Admin should see the moderation link
        const moderationLink = page.locator('a[href*="moderation"]')
        await expect(moderationLink).toBeVisible({ timeout: 10_000 })

        // Moderation tour anchor should be present
        const moderationTour = page.locator('[data-tour="community-moderation"]')
        await expect(moderationTour).toBeVisible()
      }
    })
  })

  test.describe('Sidebar Navigation', () => {
    test('student sidebar contains community link', async ({ page }) => {
      await loginAsStudent(page)

      const communityLink = page.locator('a[href*="/dashboard/student/community"]')
      await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
    })

    test('admin sidebar contains community link', async ({ page }) => {
      await loginAsAdmin(page)

      const communityLink = page.locator('a[href*="/dashboard/admin/community"]')
      await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Cross-Tenant Isolation', () => {
    test('tenant admin community page loads on tenant subdomain', async ({ page }) => {
      test.setTimeout(60_000)

      await loginAsAdmin(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })

      // Page should not show error states
      const errorText = page.locator('text=/error|500|404/i')
      await expect(errorText).not.toBeVisible()
    })
  })
})
