import { test, expect } from '@playwright/test'

// Test helper to login as admin
async function loginAsAdmin(page: any) {
  await page.goto('http://localhost:3000/auth/login')

  // Fill in admin credentials
  await page.fill('input[name="email"]', 'admin@example.com')
  await page.fill('input[name="password"]', 'admin123')

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to admin dashboard
  await page.waitForURL('**/dashboard/admin**')
}

test.describe('Admin Products - Manual Payment', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should create a product with manual payment provider', async ({ page }) => {
    // Navigate to products page
    await page.goto('http://localhost:3000/dashboard/admin/products')

    // Click "Create Product" button
    await page.click('text=Create Product')

    // Wait for form to load
    await page.waitForURL('**/products/new')

    // Fill in product details
    await page.fill('input[name="name"]', 'Complete Web Development Course')
    await page.fill('textarea[name="description"]', 'Learn full-stack web development from scratch')

    // Select manual payment provider
    await page.click('button:has-text("Payment Method")')
    await page.click('text=Manual/Offline Payment')

    // Verify help text appears
    await expect(page.locator('text=Students will contact you to arrange offline payment')).toBeVisible()

    // Fill in price
    await page.fill('input[name="price"]', '99.99')

    // Select currency
    await page.click('button:has-text("Currency")')
    await page.click('text=USD ($)')

    // Select at least one course
    // Assuming there's a course selector with checkboxes
    await page.click('input[type="checkbox"]', { timeout: 5000 })

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Product")')

    // Wait for success message
    await expect(page.locator('text=Product created successfully')).toBeVisible({ timeout: 10000 })

    // Verify redirect to products list
    await page.waitForURL('**/dashboard/admin/products')

    // Verify product appears in list
    await expect(page.locator('text=Complete Web Development Course')).toBeVisible()
  })

  test('should display payment provider badge on product list', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products')

    // Look for manual payment badge
    await expect(page.locator('text=Manual').or(page.locator('text=Offline'))).toBeVisible()
  })

  test('should create product with Stripe when selected', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products/new')

    // Fill basic details
    await page.fill('input[name="name"]', 'Stripe Payment Test Product')

    // Select Stripe
    await page.click('button:has-text("Payment Method")')
    await page.click('text=Stripe (Credit Card, Online)')

    // Verify help text
    await expect(page.locator('text=Students can pay online instantly')).toBeVisible()

    await page.fill('input[name="price"]', '49.99')
    await page.click('input[type="checkbox"]')

    await page.click('button[type="submit"]:has-text("Create Product")')

    // Should succeed (assuming Stripe env vars are set)
    await expect(page.locator('text=Product created')).toBeVisible({ timeout: 10000 })
  })

  test('should edit product and change payment provider', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products')

    // Click edit on first product
    await page.click('button:has-text("Edit")')

    // Change payment provider
    await page.click('button:has-text("Payment Method")')
    await page.click('text=Manual/Offline Payment')

    // Update price
    await page.fill('input[name="price"]', '79.99')

    // Save
    await page.click('button:has-text("Save Changes")')

    await expect(page.locator('text=Product updated')).toBeVisible({ timeout: 10000 })
  })

  test('should validate required fields', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products/new')

    // Try to submit without filling anything
    await page.click('button[type="submit"]')

    // Check for validation error
    await expect(page.locator('text=Product name is required').or(page.locator('input:invalid'))).toBeVisible()
  })

  test('should validate price is greater than 0', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products/new')

    await page.fill('input[name="name"]', 'Test Product')
    await page.fill('input[name="price"]', '0')
    await page.click('input[type="checkbox"]')

    await page.click('button[type="submit"]')

    await expect(page.locator('text=Price must be greater than 0')).toBeVisible({ timeout: 5000 })
  })

  test('should require at least one course selection', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products/new')

    await page.fill('input[name="name"]', 'Test Product')
    await page.fill('input[name="price"]', '99')

    // Don't select any courses
    await page.click('button[type="submit"]')

    await expect(page.locator('text=Please select at least one course')).toBeVisible({ timeout: 5000 })
  })

  test('should archive and restore product', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/admin/products')

    // Archive first active product
    await page.click('button:has-text("Archive")')

    // Confirm if there's a confirmation dialog
    const confirmButton = page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }

    await expect(page.locator('text=Product archived').or(page.locator('text=archived'))).toBeVisible({ timeout: 5000 })

    // Restore it
    await page.click('button:has-text("Restore")')

    await expect(page.locator('text=Product restored').or(page.locator('text=active'))).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Student - Manual Payment Flow', () => {
  async function loginAsStudent(page: any) {
    await page.goto('http://localhost:3000/auth/login')
    await page.fill('input[name="email"]', 'student@example.com')
    await page.fill('input[name="password"]', 'student123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard/student**')
  }

  test('should show contact form for manual payment products', async ({ page }) => {
    await loginAsStudent(page)

    // Navigate to products/courses page
    await page.goto('http://localhost:3000/dashboard/student')

    // Find a product with manual payment
    const manualProduct = page.locator('text=Contact for Payment').or(page.locator('text=Request Info'))

    if (await manualProduct.isVisible()) {
      await manualProduct.click()

      // Verify contact form appears
      await expect(page.locator('text=Request Payment Information')).toBeVisible()

      // Fill out contact form
      await page.fill('input[name="name"]', 'John Student')
      await page.fill('input[name="email"]', 'john@example.com')
      await page.fill('input[name="phone"]', '+1234567890')
      await page.fill('textarea[name="message"]', 'I would like to purchase this course')

      // Submit
      await page.click('button:has-text("Request Payment Info")')

      // Verify success
      await expect(page.locator('text=Payment request sent')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should show instant purchase for Stripe products', async ({ page }) => {
    await loginAsStudent(page)

    await page.goto('http://localhost:3000/dashboard/student')

    // Find a Stripe product
    const stripeProduct = page.locator('button:has-text("Buy Now")').or(page.locator('button:has-text("Purchase")'))

    if (await stripeProduct.isVisible()) {
      // Click should open Stripe checkout or payment modal
      await stripeProduct.click()

      // Verify payment UI appears (Stripe modal or redirect)
      await expect(
        page.locator('text=Payment').or(page.locator('iframe[title*="Stripe"]'))
      ).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Database Integration', () => {
  test('should store payment provider correctly in database', async ({ page }) => {
    await loginAsAdmin(page)

    // Create product via UI
    await page.goto('http://localhost:3000/dashboard/admin/products/new')
    await page.fill('input[name="name"]', 'DB Test Product')
    await page.click('button:has-text("Payment Method")')
    await page.click('text=Manual/Offline Payment')
    await page.fill('input[name="price"]', '50')
    await page.click('input[type="checkbox"]')
    await page.click('button[type="submit"]')

    await page.waitForURL('**/dashboard/admin/products')

    // Navigate to edit page
    await page.click('text=DB Test Product')

    // Verify payment provider is persisted
    await expect(page.locator('button:has-text("Payment Method")')).toContainText('Manual')
  })
})
