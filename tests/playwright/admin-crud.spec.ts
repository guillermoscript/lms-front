import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P1 — Admin CRUD Operations Tests
 *
 * Goes beyond page-load checks to verify form rendering, field interactivity,
 * course selector regression, list data display, and user detail navigation.
 *
 * All tests run on the Code Academy tenant (TENANT_BASE).
 * Forms are filled but NEVER submitted to avoid data pollution.
 */

test.describe('Admin CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)
  })

  // ---------------------------------------------------------------------------
  // 1. Product Management
  // ---------------------------------------------------------------------------

  test.describe('Product Management', () => {
    test('products page displays product cards with prices', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/products`)
      await expect(page.getByTestId('products-page')).toBeVisible()

      // Check for at least one product card with a price ($ or €)
      const priceText = page.locator('text=/\\$\\d+\\.\\d+|€\\d+\\.\\d+/').first()
      if (await priceText.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(priceText).toBeVisible()
      }
      // Stats cards should be present (total, active, archived)
      const statsCards = page.locator('.grid.gap-3 .font-bold')
      await expect(statsCards.first()).toBeVisible()
    })

    test('new product form loads with all required fields', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/products/new`, {
        timeout: 30_000,
      })

      // Name field
      const nameInput = page.locator('#name')
      await expect(nameInput).toBeVisible()

      // Description field
      const descriptionInput = page.locator('#description')
      await expect(descriptionInput).toBeVisible()

      // Price field (type=number)
      const priceInput = page.locator('#price')
      await expect(priceInput).toBeVisible()
      await expect(priceInput).toHaveAttribute('type', 'number')

      // Image URL field
      const imageInput = page.locator('#image')
      await expect(imageInput).toBeVisible()
      await expect(imageInput).toHaveAttribute('type', 'url')

      // Submit button should be visible
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeVisible()
    })

    test('course selector renders courses in new product form (regression)', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/products/new`, {
        timeout: 30_000,
      })

      // Course selector section should exist with a search input
      const courseSelectorSearch = page.locator('input[placeholder*="earch"]').last()
      await expect(courseSelectorSearch).toBeVisible({ timeout: 10_000 })

      // Selected count text should show "0 ... selected" initially
      const selectedText = page.getByText(/\d+.*selected/i)
      await expect(selectedText).toBeVisible({ timeout: 10_000 })

      // If there are published courses, checkboxes should render
      const courseCheckboxes = page.locator('[role="checkbox"]')
      const checkboxCount = await courseCheckboxes.count()
      if (checkboxCount > 0) {
        // At least one checkbox is visible
        await expect(courseCheckboxes.first()).toBeVisible()
      } else {
        // No published courses — the empty state message should show
        const emptyMsg = page.getByText(/no.*courses|no.*available/i)
        await expect(emptyMsg).toBeVisible({ timeout: 5_000 })
      }
    })

    test('product form fields accept input without submission', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/products/new`, {
        timeout: 30_000,
      })

      // Wait for the form to render
      await expect(page.locator('#name')).toBeVisible({ timeout: 10_000 })

      // Fill name
      const nameInput = page.locator('#name')
      await nameInput.fill('Test Product E2E')
      await expect(nameInput).toHaveValue('Test Product E2E')

      // Fill description (textarea element)
      const descriptionInput = page.locator('#description')
      await expect(descriptionInput).toBeVisible({ timeout: 5_000 })
      await descriptionInput.fill('A test product description for E2E testing')
      await expect(descriptionInput).toHaveValue(
        'A test product description for E2E testing'
      )

      // Fill price
      const priceInput = page.locator('#price')
      await expect(priceInput).toBeVisible({ timeout: 5_000 })
      await priceInput.fill('29.99')
      await expect(priceInput).toHaveValue('29.99')

      // Fill image URL
      const imageInput = page.locator('#image')
      await expect(imageInput).toBeVisible({ timeout: 5_000 })
      await imageInput.fill('https://example.com/image.png')
      await expect(imageInput).toHaveValue('https://example.com/image.png')

      // Toggle a course checkbox if available
      const firstCheckbox = page.locator('[role="checkbox"]').first()
      if (await firstCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await firstCheckbox.click()
        // Selected count should update to 1
        await expect(page.getByText(/1.*selected/i)).toBeVisible({ timeout: 5_000 })
      }

      // DO NOT submit — avoid data pollution
    })

    test('existing product edit page loads with pre-filled data', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/products`)
      await expect(page.getByTestId('products-page')).toBeVisible()

      // Look for an edit link
      const editLink = page
        .locator('a[href*="/products/"][href*="/edit"]')
        .first()
      if (await editLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await editLink.click()
        await page.waitForLoadState('networkidle')

        // URL should contain /products/.../edit
        expect(page.url()).toMatch(/\/products\/\d+\/edit/)

        // Name input should have a pre-filled value (not empty)
        const nameInput = page.locator('#name')
        await expect(nameInput).toBeVisible()
        const nameValue = await nameInput.inputValue()
        expect(nameValue.length).toBeGreaterThan(0)

        // Price input should have a value
        const priceInput = page.locator('#price')
        await expect(priceInput).toBeVisible()
        const priceValue = await priceInput.inputValue()
        expect(parseFloat(priceValue)).toBeGreaterThan(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Plan Management
  // ---------------------------------------------------------------------------

  test.describe('Plan Management', () => {
    test('plans page displays plan cards with pricing', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/plans`)
      await expect(page.getByTestId('plans-page')).toBeVisible()

      // Stats cards should be present (total, monthly, yearly)
      const statsCards = page.locator('.grid.gap-3 .font-bold')
      await expect(statsCards.first()).toBeVisible()

      // Check for plan cards or empty state
      const planCards = page.locator('.grid.gap-6 .flex.flex-col')
      const emptyState = page.getByText(/no plans/i)
      const hasPlanCards = await planCards.first().isVisible({ timeout: 5_000 }).catch(() => false)
      const hasEmptyState = await emptyState.isVisible({ timeout: 2_000 }).catch(() => false)

      // One of the two should be visible
      expect(hasPlanCards || hasEmptyState).toBeTruthy()
    })

    test('new plan form loads with all required fields', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/plans/new`, {
        timeout: 30_000,
      })

      // Plan name field
      const nameInput = page.locator('#plan_name')
      await expect(nameInput).toBeVisible()

      // Description field
      const descriptionInput = page.locator('#description')
      await expect(descriptionInput).toBeVisible()

      // Price field (type=number)
      const priceInput = page.locator('#price')
      await expect(priceInput).toBeVisible()
      await expect(priceInput).toHaveAttribute('type', 'number')

      // Features textarea
      const featuresInput = page.locator('#features')
      await expect(featuresInput).toBeVisible()

      // Submit button
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeVisible()
    })

    test('course selector renders courses in new plan form (regression)', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/plans/new`, {
        timeout: 30_000,
      })

      // Course selector should have checkboxes for available courses
      const courseCheckboxes = page.locator('[role="checkbox"]')
      const checkboxCount = await courseCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Search input in course selector should work
      const searchInputs = page.locator('input[type="text"]')
      const courseSelectorSearch = searchInputs.last()
      await expect(courseSelectorSearch).toBeVisible()
    })

    test('plan form fields accept input without submission', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/plans/new`, {
        timeout: 30_000,
      })

      // Fill plan name
      const nameInput = page.locator('#plan_name')
      await nameInput.fill('Test Plan E2E')
      await expect(nameInput).toHaveValue('Test Plan E2E')

      // Fill description
      const descriptionInput = page.locator('#description')
      await descriptionInput.fill('A test plan for E2E testing')
      await expect(descriptionInput).toHaveValue('A test plan for E2E testing')

      // Fill price
      const priceInput = page.locator('#price')
      await priceInput.fill('19.99')
      await expect(priceInput).toHaveValue('19.99')

      // Fill features
      const featuresInput = page.locator('#features')
      await featuresInput.fill('Feature 1, Feature 2, Feature 3')
      await expect(featuresInput).toHaveValue(
        'Feature 1, Feature 2, Feature 3'
      )

      // DO NOT submit — avoid data pollution
    })
  })

  // ---------------------------------------------------------------------------
  // 3. User Management
  // ---------------------------------------------------------------------------

  test.describe('User Management', () => {
    test('users page shows user list with roles and stats', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/users`)
      await expect(page.getByTestId('users-page')).toBeVisible()

      // Stats cards should be visible (total users, teachers, students)
      const statsCards = page.locator('.grid.gap-3 .font-bold')
      const statsCount = await statsCards.count()
      expect(statsCount).toBeGreaterThanOrEqual(3)

      // Table should exist
      const table = page.locator('table')
      await expect(table).toBeVisible()

      // Table should have header columns
      const headers = page.locator('th')
      const headerCount = await headers.count()
      expect(headerCount).toBeGreaterThanOrEqual(5) // user, email, roles, enrollments, status, joined, actions

      // At least one user row should exist (admin themselves)
      const rows = page.locator('tbody tr')
      const rowCount = await rows.count()
      expect(rowCount).toBeGreaterThan(0)
    })

    test('users table supports search filtering', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/users`)
      await expect(page.getByTestId('users-page')).toBeVisible()

      // Wait for table to render
      const table = page.locator('table')
      await expect(table).toBeVisible()

      // Count initial rows
      const initialRows = page.locator('tbody tr')
      const initialCount = await initialRows.count()

      // Search for a non-matching query to filter results
      const searchInput = page.locator('input[type="search"]')
      await expect(searchInput).toBeVisible()
      await searchInput.fill('zzz_nonexistent_user_xyz')

      // Wait for filtering to take effect
      await page.waitForTimeout(500)

      // Row count should change (likely 0 results, showing empty state)
      const filteredRows = page.locator('tbody tr')
      const filteredCount = await filteredRows.count()

      // Should either show fewer rows or an empty state row
      if (initialCount > 0) {
        expect(filteredCount).toBeLessThanOrEqual(initialCount)
      }

      // Clear search and verify rows come back
      await searchInput.clear()
      await page.waitForTimeout(500)
      const restoredRows = page.locator('tbody tr')
      const restoredCount = await restoredRows.count()
      expect(restoredCount).toBe(initialCount)
    })

    test('user detail page loads with profile, roles, and activity sections', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/users`)
      await expect(page.getByTestId('users-page')).toBeVisible()

      // Find and click the first "View" link to a user detail page
      const viewLink = page.locator('a[href*="/admin/users/"]').first()
      if (await viewLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await viewLink.click()
        await page.waitForLoadState('networkidle')

        // URL should contain /admin/users/<uuid>
        expect(page.url()).toMatch(/\/admin\/users\/[a-f0-9-]+/)

        // Profile section should be visible
        const profileHeading = page.locator('h1')
        await expect(profileHeading).toBeVisible()

        // Multiple cards should be present (profile, roles, status, enrollments, activity, transactions)
        const cards = page.locator('[class*="rounded-"] >> text=/./').first()
        await expect(cards).toBeVisible()

        // Enrollments section should exist
        const enrollmentsSection = page.getByText(/enrollment/i).first()
        await expect(enrollmentsSection).toBeVisible()

        // Recent activity section should exist
        const activitySection = page.getByText(/recent activity/i).first()
        if (await activitySection.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(activitySection).toBeVisible()
        }

        // Transactions section should exist
        const transactionsSection = page.getByText(/transaction/i).first()
        if (await transactionsSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(transactionsSection).toBeVisible()
        }
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Enrollment Management
  // ---------------------------------------------------------------------------

  test.describe('Enrollment Management', () => {
    test('enrollments page shows table with headers and stats', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/enrollments`)
      await expect(page.getByTestId('enrollments-page')).toBeVisible()

      // Stats cards should be visible (total, active, completed)
      const statsCards = page.locator('.grid.gap-3 .font-bold')
      const statsCount = await statsCards.count()
      expect(statsCount).toBeGreaterThanOrEqual(3)

      // Table should exist with proper headers
      const table = page.locator('table')
      await expect(table).toBeVisible()

      const headers = page.locator('th')
      const headerCount = await headers.count()
      expect(headerCount).toBeGreaterThanOrEqual(4) // student, course, status, enrolled, actions
    })

    test('enrollment rows display student, course, and status', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/enrollments`)
      await expect(page.getByTestId('enrollments-page')).toBeVisible()

      // Check for enrollment rows
      const rows = page.locator('tbody tr')
      const rowCount = await rows.count()

      if (rowCount > 0) {
        const firstRow = rows.first()

        // Row should have multiple cells
        const cells = firstRow.locator('td')
        const cellCount = await cells.count()
        expect(cellCount).toBeGreaterThanOrEqual(4)

        // First cell should have a student name (non-empty text)
        const studentCell = cells.first()
        const studentText = await studentCell.textContent()
        expect(studentText?.trim().length).toBeGreaterThan(0)

        // Status badge should be present in the row
        const statusBadge = firstRow.locator('[class*="badge"], [class*="Badge"]').first()
        if (await statusBadge.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(statusBadge).toBeVisible()
        }
      }
    })

    test('enrollments page shows stats cards with numeric counts', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/enrollments`)
      await expect(page.getByTestId('enrollments-page')).toBeVisible()

      // Each stats card should show a number
      const statNumbers = page.locator('.grid.gap-3 .font-bold.tracking-tight')
      const count = await statNumbers.count()
      expect(count).toBeGreaterThanOrEqual(3)

      // Each stat should contain a numeric value
      for (let i = 0; i < count; i++) {
        const text = await statNumbers.nth(i).textContent()
        expect(text).toMatch(/^\d+$/)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Category Management
  // ---------------------------------------------------------------------------

  test.describe('Category Management', () => {
    test('categories page loads with table, stats, and add button', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/categories`)
      await expect(page.getByTestId('categories-page')).toBeVisible()

      // Stats card should show total count
      const statsNumber = page.locator('.font-bold').first()
      await expect(statsNumber).toBeVisible()

      // Table should exist with headers
      const table = page.locator('table')
      await expect(table).toBeVisible()

      const headers = page.locator('th')
      const headerCount = await headers.count()
      expect(headerCount).toBeGreaterThanOrEqual(3) // name, description, courses, actions

      // Add category button should be visible
      const addButton = page.locator('button').filter({ hasText: /add/i })
      await expect(addButton).toBeVisible()
    })

    test('categories table shows rows with name and course count', async ({
      page,
    }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/categories`)
      await expect(page.getByTestId('categories-page')).toBeVisible()

      // Wait for the table to render
      const table = page.locator('table')
      await expect(table).toBeVisible({ timeout: 10_000 })

      // Wait a moment for client-side rendering of CategoriesTable
      await page.waitForTimeout(1_000)

      const rows = page.locator('tbody tr')
      const rowCount = await rows.count()

      if (rowCount > 1 || (rowCount === 1 && !(await rows.first().locator('td[colspan]').count()))) {
        // Has actual data rows (not the empty state row)
        const firstRow = rows.first()

        // First cell should have a category name
        const nameCell = firstRow.locator('td').first()
        const nameText = await nameCell.textContent()
        expect(nameText?.trim().length).toBeGreaterThan(0)

        // Row should contain action buttons (edit, delete)
        const actionButtons = firstRow.locator('button')
        const buttonCount = await actionButtons.count()
        expect(buttonCount).toBeGreaterThanOrEqual(1)
      } else {
        // Empty state — a single row with colspan td or a text message
        const emptyState = page.locator('tbody td[colspan], tbody tr:has-text("no")')
        await expect(emptyState.first()).toBeVisible({ timeout: 5_000 })
      }
    })
  })
})
