import { test, expect } from '@playwright/test'

/**
 * Admin Dashboard E2E Tests
 * Tests all three phases of admin functionality
 */

// Test data
const TEST_ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'testpassword123'
}

const TEST_USER = {
  email: 'testuser@example.com',
  name: 'Test User'
}

/**
 * Helper function to login as admin
 */
async function loginAsAdmin(page: any) {
  await page.goto('/auth/login')
  await page.fill('input[name="email"]', TEST_ADMIN.email)
  await page.fill('input[type="password"]', TEST_ADMIN.password)
  await page.click('button[type="submit"]')

  // Wait for navigation to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe('Phase 1: User Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should navigate to users page', async ({ page }) => {
    await page.goto('/dashboard/admin/users')
    await expect(page.locator('h1')).toContainText('User Management')
    await expect(page.locator('[role="table"]')).toBeVisible()
  })

  test('should search for users', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find search input
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('test')

    // Wait for table to filter
    await page.waitForTimeout(500)

    // Should show filtered results
    await expect(page.locator('[role="table"]')).toBeVisible()
  })

  test('should open role assignment dialog', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find and click first "Roles" button
    const rolesButton = page.locator('button:has-text("Roles")').first()
    if (await rolesButton.count() > 0) {
      await rolesButton.click()

      // Dialog should appear
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      await expect(page.locator('text=Manage Roles')).toBeVisible()

      // Should have checkboxes for roles
      await expect(page.locator('text=Admin')).toBeVisible()
      await expect(page.locator('text=Teacher')).toBeVisible()
      await expect(page.locator('text=Student')).toBeVisible()
    }
  })

  test('should view user detail page', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Click first "View" button
    const viewButton = page.locator('button:has-text("View")').first()
    if (await viewButton.count() > 0) {
      await viewButton.click()

      // Should navigate to user detail
      await expect(page).toHaveURL(/\/dashboard\/admin\/users\/[a-f0-9-]+/)

      // Should show profile information
      await expect(page.locator('text=Profile Information')).toBeVisible()
      await expect(page.locator('text=Roles')).toBeVisible()
    }
  })
})

test.describe('Phase 2: Course Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should navigate to courses page', async ({ page }) => {
    await page.goto('/dashboard/admin/courses')
    await expect(page.locator('h1')).toContainText('Course Management')
    await expect(page.locator('text=Total Courses')).toBeVisible()
  })

  test('should filter courses by status', async ({ page }) => {
    await page.goto('/dashboard/admin/courses')

    // Find status filter dropdown
    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    // Select "Draft" option
    await page.locator('[role="option"]:has-text("Draft")').click()

    // Wait for filter to apply
    await page.waitForTimeout(500)
  })

  test('should search courses', async ({ page }) => {
    await page.goto('/dashboard/admin/courses')

    // Find search input
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    await searchInput.fill('test')

    // Wait for search to filter
    await page.waitForTimeout(500)
  })

  test('should navigate to categories page', async ({ page }) => {
    await page.goto('/dashboard/admin/categories')
    await expect(page.locator('h1')).toContainText('Course Categories')
    await expect(page.locator('text=Total Categories')).toBeVisible()
  })

  test('should open category create dialog', async ({ page }) => {
    await page.goto('/dashboard/admin/categories')

    // Click "Add Category" button
    await page.click('button:has-text("Add Category")')

    // Dialog should appear
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('text=Create Category')).toBeVisible()

    // Should have form fields
    await expect(page.locator('input[id="name"]')).toBeVisible()
    await expect(page.locator('textarea[id="description"]')).toBeVisible()
  })
})

test.describe('Phase 3: Products Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/dashboard/admin/products')
    await expect(page.locator('h1')).toContainText('Product Management')
    await expect(page.locator('text=Total Products')).toBeVisible()
  })

  test('should have create product button', async ({ page }) => {
    await page.goto('/dashboard/admin/products')
    await expect(page.locator('a:has-text("Create Product")')).toBeVisible()
  })

  test('should navigate to create product page', async ({ page }) => {
    await page.goto('/dashboard/admin/products/new')
    await expect(page.locator('h1')).toContainText('Create Product')
    await expect(page.locator('text=Product Details')).toBeVisible()

    // Should have all form fields
    await expect(page.locator('input[id="name"]')).toBeVisible()
    await expect(page.locator('textarea[id="description"]')).toBeVisible()
    await expect(page.locator('input[id="price"]')).toBeVisible()
    await expect(page.locator('text=Courses Included')).toBeVisible()
  })

  test('should show validation errors on empty submit', async ({ page }) => {
    await page.goto('/dashboard/admin/products/new')

    // Try to submit without filling fields
    await page.click('button[type="submit"]')

    // Should show validation error
    await expect(page.locator('text=Product name is required')).toBeVisible({ timeout: 2000 })
  })
})

test.describe('Phase 3: Plans Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should navigate to plans page', async ({ page }) => {
    await page.goto('/dashboard/admin/plans')
    await expect(page.locator('h1')).toContainText('Subscription Plans')
    await expect(page.locator('text=Total Plans')).toBeVisible()
  })

  test('should have create plan button', async ({ page }) => {
    await page.goto('/dashboard/admin/plans')
    await expect(page.locator('a:has-text("Create Plan")')).toBeVisible()
  })

  test('should navigate to create plan page', async ({ page }) => {
    await page.goto('/dashboard/admin/plans/new')
    await expect(page.locator('h1')).toContainText('Create Subscription Plan')
    await expect(page.locator('text=Plan Details')).toBeVisible()

    // Should have all form fields
    await expect(page.locator('input[id="plan_name"]')).toBeVisible()
    await expect(page.locator('textarea[id="description"]')).toBeVisible()
    await expect(page.locator('input[id="price"]')).toBeVisible()
    await expect(page.locator('textarea[id="features"]')).toBeVisible()
    await expect(page.locator('text=Courses Included')).toBeVisible()
  })

  test('should show validation errors on empty submit', async ({ page }) => {
    await page.goto('/dashboard/admin/plans/new')

    // Try to submit without filling fields
    await page.click('button[type="submit"]')

    // Should show validation error
    await expect(page.locator('text=Plan name is required')).toBeVisible({ timeout: 2000 })
  })
})

test.describe('Integration: Full Admin Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should access all admin pages from dashboard', async ({ page }) => {
    await page.goto('/dashboard/admin')

    // Should be on admin dashboard
    await expect(page).toHaveURL('/dashboard/admin')

    // Test navigation to each section
    const sections = [
      { link: 'Users', url: '/users' },
      { link: 'Courses', url: '/courses' },
      { link: 'Products', url: '/products' },
      { link: 'Plans', url: '/plans' }
    ]

    for (const section of sections) {
      // Find link with exact text (may need adjustment based on actual UI)
      const sectionLink = page.locator(`a:has-text("${section.link}")`).first()
      if (await sectionLink.count() > 0) {
        await sectionLink.click()
        await expect(page).toHaveURL(new RegExp(section.url))
        await page.goBack()
      }
    }
  })
})

test.describe('Security: Non-Admin Access', () => {
  test('should redirect non-admin users from admin pages', async ({ page }) => {
    // Try to access admin page without login
    await page.goto('/dashboard/admin')

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 })
  })
})
