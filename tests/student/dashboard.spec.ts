import { test, expect } from '@playwright/test'

/**
 * Student Dashboard Tests
 * Tests student learning dashboard functionality
 */

// Helper function to login as student
async function loginAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/auth/login')
  await page.getByRole('textbox', { name: 'Email' }).fill('student@test.com')
  await page.getByRole('textbox', { name: 'Password' }).fill('password123')
  await page.getByRole('button', { name: 'Login' }).click()

  // Wait for navigation and go to student dashboard
  await page.waitForLoadState('networkidle')
  await page.goto('/dashboard/student')
}

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page)
  })

  test('should display dashboard with correct heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Learning' })).toBeVisible()
    await expect(page.getByText('Welcome back! Continue where you left off.')).toBeVisible()
  })

  test('should display statistics cards', async ({ page }) => {
    // Check that all three stat cards are visible
    await expect(page.getByText('Enrolled Courses')).toBeVisible()
    await expect(page.getByText('Lessons Completed')).toBeVisible()
    await expect(page.getByText('Courses Completed')).toBeVisible()

    // Verify numbers are displayed (should be numeric)
    const enrolledCourses = await page.locator('text="Enrolled Courses"').locator('..').locator('p').first().textContent()
    expect(enrolledCourses).toMatch(/^\d+$/) // Should be a number
  })

  test('should display enrolled course card', async ({ page }) => {
    // Wait for courses to load
    await expect(page.getByText('Introduction to JavaScript')).toBeVisible()

    // Verify course card elements
    const courseCard = page.getByRole('link', { name: /Introduction to JavaScript/ })
    await expect(courseCard).toBeVisible()

    // Verify description
    await expect(page.getByText('Learn the fundamentals of JavaScript')).toBeVisible()

    // Verify progress indicator
    await expect(page.getByText(/Progress/)).toBeVisible()
    await expect(page.getByText(/\d+\/\d+ lessons/)).toBeVisible()
  })

  test('should navigate to course detail when clicking course card', async ({ page }) => {
    await page.getByRole('link', { name: /Introduction to JavaScript/ }).click()

    // Should navigate to course detail page
    await expect(page).toHaveURL(/\/dashboard\/student\/courses\/\d+/)

    // Verify course detail page loaded
    await expect(page.getByRole('heading', { name: 'Introduction to JavaScript' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Course' })).toBeVisible()
  })

  test('should show empty state when no courses enrolled', async ({ page }) => {
    // This test assumes a user with no enrollments
    // For now, we'll skip this as test student has enrollments
    test.skip()
  })

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // Dashboard should still be visible
    await expect(page.getByRole('heading', { name: 'My Learning' })).toBeVisible()

    // Stats should still be accessible
    await expect(page.getByText('Enrolled Courses')).toBeVisible()
  })
})
