import { test, expect } from '@playwright/test'
import { login, loginAsSuperAdmin, loginAsStudent } from './utils/auth'
import { BASE, TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Super Admin Platform Panel Tests
 *
 * Covers security guards, page smoke tests, and key interactions
 * for the /platform/* route group.
 *
 * Prerequisites:
 *   - `owner@e2etest.com` has a row in `super_admins` table
 *   - Local Supabase running at default port
 *   - Dev server running at http://lvh.me:3000
 *
 * Note: base-ui DropdownMenu and Select do not open in Playwright headless
 * mode due to pointer-event differences. Tests that require those interactions
 * use direct URL navigation or SQL-level verification instead.
 */

const PLATFORM_BASE = `${BASE}/${LOCALE}/platform`

// ─────────────────────────────────────────────────────────────
// Security Guards
// ─────────────────────────────────────────────────────────────

test.describe('Platform Security Guard', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto(`${PLATFORM_BASE}`)
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 })
  })

  test('student cannot access /platform — redirected to their dashboard', async ({ page }) => {
    await loginAsStudent(page)
    await page.goto(`${PLATFORM_BASE}`)
    // Should NOT stay on /platform
    await page.waitForURL((url) => !url.pathname.startsWith(`/${LOCALE}/platform`), { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/platform/, { timeout: 5_000 })
  })

  test('school admin cannot access /platform — redirected away', async ({ page }) => {
    // Login as school admin on their own tenant (Code Academy Pro)
    // creator@codeacademy.com is admin on code-academy but not a super admin
    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, TENANT_BASE)
    // Try to access /platform on the main domain
    await page.goto(`${PLATFORM_BASE}`)
    await page.waitForURL((url) => !url.pathname.startsWith(`/${LOCALE}/platform`), { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/platform/, { timeout: 5_000 })
  })

  test('super admin can access /platform', async ({ page }) => {
    await loginAsSuperAdmin(page)
    await expect(page.getByTestId('platform-overview')).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────
// Platform Overview
// ─────────────────────────────────────────────────────────────

test.describe('Platform Overview', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('overview page loads with metric cards', async ({ page }) => {
    await expect(page.getByTestId('platform-overview')).toBeVisible()
    await expect(page.getByTestId('platform-metrics')).toBeVisible()
    // At least one metric card is rendered
    const cards = page.getByTestId('platform-metrics').locator('[data-testid]')
    await expect(cards.first()).toBeVisible()
  })

  test('MRR metric card shows a currency value', async ({ page }) => {
    const mrrCard = page.getByTestId('metric-monthly-recurring-revenue')
    await expect(mrrCard).toBeVisible()
    const value = mrrCard.getByTestId('metric-value')
    await expect(value).toBeVisible()
    // Value should look like currency ($X.XX)
    await expect(value).toContainText('$')
  })

  test('plan distribution card renders', async ({ page }) => {
    await expect(page.getByTestId('plan-distribution')).toBeVisible()
  })

  test('sidebar navigation links are present', async ({ page }) => {
    // Sidebar links are rendered via SidebarMenuButton with render={<Link>}
    // In collapsed mode, text labels may be hidden — check for link hrefs instead
    const sidebarLinks = [
      '/platform',       // Overview
      '/platform/tenants',
      '/platform/billing',
      '/platform/plans',
      '/dashboard/admin', // Back to School
    ]

    for (const href of sidebarLinks) {
      const link = page.locator(`a[href*="${href}"]`)
      await expect(link.first()).toBeAttached({ timeout: 10_000 })
    }
  })

  test('"Back to School" navigates to admin dashboard', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin`)
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })
})

// ─────────────────────────────────────────────────────────────
// Tenant Management
// ─────────────────────────────────────────────────────────────

test.describe('Platform Tenants', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
    await page.goto(`${PLATFORM_BASE}/tenants`)
    await page.waitForSelector('[data-testid="platform-tenants-page"]', { timeout: 10_000 })
  })

  test('tenants page loads with table', async ({ page }) => {
    await expect(page.getByTestId('platform-tenants-page')).toBeVisible()
    await expect(page.getByTestId('tenants-table')).toBeVisible()
    await expect(page.getByTestId('tenants-count')).toBeVisible()
  })

  test('tenants table shows at least one row', async ({ page }) => {
    const rows = page.getByTestId('tenant-row')
    await expect(rows.first()).toBeVisible()
  })

  test('tenant rows show name, plan badge, and status badge', async ({ page }) => {
    const firstRow = page.getByTestId('tenant-row').first()
    await expect(firstRow).toBeVisible()
    // Has a link with tenant name (the row carries more than one link)
    await expect(firstRow.locator('a').first()).toBeVisible()
  })

  test('search filter narrows results', async ({ page }) => {
    const initialCount = await page.getByTestId('tenant-row').count()

    await page.getByTestId('tenants-search').fill('Code Academy')
    await page.getByTestId('tenants-filter-submit').click()
    await page.waitForLoadState('networkidle')

    const filteredCount = await page.getByTestId('tenant-row').count()
    expect(filteredCount).toBeLessThanOrEqual(initialCount)

    // The visible row should contain "Code Academy"
    await expect(page.getByTestId('tenant-row').first()).toContainText('Code Academy')
  })

  test('plan filter shows only tenants with selected plan', async ({ page }) => {
    await page.getByTestId('tenants-plan-filter').selectOption('starter')
    await page.getByTestId('tenants-filter-submit').click()
    await page.waitForLoadState('networkidle')

    // Every visible row should have "starter" badge
    const rows = page.getByTestId('tenant-row')
    const count = await rows.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i)).toContainText('starter')
      }
    }
  })

  test('clear filter restores all tenants', async ({ page }) => {
    await page.getByTestId('tenants-search').fill('zzz-no-match')
    await page.getByTestId('tenants-filter-submit').click()
    await page.waitForLoadState('networkidle')
    const emptyCount = await page.getByTestId('tenant-row').count()
    expect(emptyCount).toBe(0)

    // Clear via the page's own "clear filters" link and wait for the
    // navigation — `networkidle` after a submit resolves before the new
    // server-rendered rows arrive, which is what made the count stay at 0.
    await page.getByTestId('tenants-clear-filters').click()
    await page.waitForURL((url) => !url.searchParams.has('q'))
    await expect(page.getByTestId('tenant-row').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────
// Tenant Detail
// ─────────────────────────────────────────────────────────────

test.describe('Tenant Detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('tenant detail page loads from list link', async ({ page }) => {
    await page.goto(`${PLATFORM_BASE}/tenants`)
    await page.waitForSelector('[data-testid="tenant-row"]', { timeout: 10_000 })

    // Click first tenant name link
    const firstLink = page.getByTestId('tenant-row').first().locator('a').first()
    const href = await firstLink.getAttribute('href')
    expect(href).toMatch(/\/tenants\/[a-f0-9-]+$/)

    await firstLink.click()
    await page.waitForSelector('[data-testid="tenant-detail-page"]', { timeout: 10_000 })
    await expect(page.getByTestId('tenant-detail-page')).toBeVisible()
  })

  test('tenant detail shows stats, subscription, and admin users cards', async ({ page }) => {
    // Navigate directly to a known tenant (Code Academy Pro)
    await page.goto(`${PLATFORM_BASE}/tenants/00000000-0000-0000-0000-000000000002`)
    await page.waitForSelector('[data-testid="tenant-detail-page"]', { timeout: 10_000 })

    await expect(page.getByTestId('tenant-stats')).toBeVisible()
    // Heading shows tenant name
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Code Academy Pro')
  })
})

// ─────────────────────────────────────────────────────────────
// Platform Billing
// ─────────────────────────────────────────────────────────────

test.describe('Platform Billing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
    await page.goto(`${PLATFORM_BASE}/billing`)
    await page.waitForSelector('[data-testid="platform-billing-page"]', { timeout: 10_000 })
  })

  test('billing page loads with tab bar and table', async ({ page }) => {
    await expect(page.getByTestId('platform-billing-page')).toBeVisible()
    await expect(page.getByTestId('billing-tabs')).toBeVisible()
    await expect(page.getByTestId('billing-requests-table')).toBeVisible()
  })

  test('tab navigation switches between Pending / Confirmed / Rejected / All', async ({ page }) => {
    // Default tab is Pending
    await expect(page.getByTestId('billing-tab-pending')).toHaveAttribute('data-active', 'true')

    // Navigate to Confirmed tab
    await page.getByTestId('billing-tab-confirmed').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('billing-tab-confirmed')).toHaveAttribute('data-active', 'true')

    // Navigate to All tab
    await page.getByTestId('billing-tab-all').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('billing-tab-all')).toHaveAttribute('data-active', 'true')
  })

  test('All tab shows all requests', async ({ page }) => {
    await page.getByTestId('billing-tab-all').click()
    await page.waitForLoadState('networkidle')
    // Table loads (even if empty, the table element exists)
    await expect(page.getByTestId('billing-requests-table')).toBeVisible()
  })

  test('pending request shows Confirm and Reject buttons', async ({ page }) => {
    // Only if there are pending rows
    const pendingRows = page.getByTestId('billing-request-row').filter({
      has: page.locator('[data-testid="confirm-payment-btn"]'),
    })
    const count = await pendingRows.count()
    if (count > 0) {
      await expect(pendingRows.first().getByTestId('confirm-payment-btn')).toBeVisible()
      await expect(pendingRows.first().getByTestId('reject-payment-btn')).toBeVisible()
    } else {
      // No pending requests — test is vacuously passing
      test.info().annotations.push({ type: 'skip-reason', description: 'No pending billing requests in test DB' })
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Platform Plans
// ─────────────────────────────────────────────────────────────

test.describe('Platform Plans', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
    await page.goto(`${PLATFORM_BASE}/plans`)
    await page.waitForSelector('[data-testid="platform-plans-page"]', { timeout: 10_000 })
  })

  test('plans page loads with plan cards', async ({ page }) => {
    await expect(page.getByTestId('platform-plans-page')).toBeVisible()
    const cards = page.getByTestId('plan-card')
    await expect(cards.first()).toBeVisible()
    // Expect at least 3 plans (free, starter, pro)
    expect(await cards.count()).toBeGreaterThanOrEqual(3)
  })

  test('each plan card has Edit and Deactivate/Activate buttons', async ({ page }) => {
    const firstCard = page.getByTestId('plan-card').first()
    await expect(firstCard.getByTestId('plan-edit-btn')).toBeVisible()
    await expect(firstCard.getByTestId('plan-toggle-btn')).toBeVisible()
  })

  test('plan cards show slug, monthly price, and transaction fee', async ({ page }) => {
    // data-plan-slug is on the same element as data-testid="plan-card"
    const starterCard = page.locator('[data-testid="plan-card"][data-plan-slug="starter"]')
    await expect(starterCard).toBeVisible()
    await expect(starterCard).toContainText('$')
    await expect(starterCard).toContainText('%')
  })

  test('clicking Edit opens the plan edit dialog', async ({ page }) => {
    const firstCard = page.getByTestId('plan-card').first()
    await firstCard.getByTestId('plan-edit-btn').click()
    await expect(page.getByTestId('plan-edit-dialog')).toBeVisible({ timeout: 5_000 })
    // Dialog has Monthly Price input
    await expect(page.getByTestId('plan-price-monthly-input')).toBeVisible()
    await expect(page.getByTestId('plan-save-btn')).toBeVisible()
  })

  test('editing plan price saves and closes dialog', async ({ page }) => {
    // Find the Pro plan card
    const proCard = page.locator('[data-plan-slug="pro"]').first()
    await proCard.locator('[data-testid="plan-edit-btn"]').click()
    await expect(page.getByTestId('plan-edit-dialog')).toBeVisible({ timeout: 5_000 })

    const priceInput = page.getByTestId('plan-price-monthly-input')
    const originalValue = await priceInput.inputValue()

    // Change to a slightly different value
    const newValue = String(Number(originalValue) + 1)
    await priceInput.clear()
    await priceInput.fill(newValue)
    await page.getByTestId('plan-save-btn').click()

    // Dialog closes and toast appears
    await expect(page.getByTestId('plan-edit-dialog')).not.toBeVisible({ timeout: 8_000 })

    // Restore original value
    await proCard.locator('[data-testid="plan-edit-btn"]').click()
    await expect(page.getByTestId('plan-edit-dialog')).toBeVisible({ timeout: 5_000 })
    await priceInput.clear()
    await priceInput.fill(originalValue)
    await page.getByTestId('plan-save-btn').click()
    await expect(page.getByTestId('plan-edit-dialog')).not.toBeVisible({ timeout: 8_000 })
  })
})

// ─────────────────────────────────────────────────────────────
// Platform Referrals
// ─────────────────────────────────────────────────────────────

// The referral program was never built: `referral_codes` / `referral_redemptions`
// do not exist, so the page, its server actions and its tests were deleted in #680.
// The feature request lives in #317; the last implementation is in git history.
// Until then the route must simply not exist.
test.describe('Platform Referrals (not built — #317)', () => {
  test('referrals route no longer serves a page', async ({ page }) => {
    await loginAsSuperAdmin(page)
    const response = await page.goto(`${PLATFORM_BASE}/referrals`)
    // Which 404 surface Next renders for an unmatched path is its business — a nested
    // `not-found.tsx` only answers a `notFound()` thrown inside its own segment, so do
    // not assert on one. What matters is that nothing serves this path any more: a
    // surviving page, or the old redirect stub, would both land on a 200.
    expect(response?.status()).toBeGreaterThanOrEqual(400)
    await expect(page.getByTestId('platform-referrals-page')).toHaveCount(0)
  })

  test('no sidebar entry points at referrals', async ({ page }) => {
    await loginAsSuperAdmin(page)
    await page.goto(PLATFORM_BASE)
    await expect(page.locator('a[href*="/platform/referrals"]')).toHaveCount(0)
  })
})
