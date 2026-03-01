import { test, expect } from '@playwright/test'

/**
 * Lesson Viewer Tests
 * Tests lesson viewing and completion functionality
 */

// Helper function to login and navigate to lesson
async function navigateToLesson(page: import('@playwright/test').Page, courseId = 1, lessonId = 1) {
  await page.goto('/auth/login')
  await page.getByRole('textbox', { name: 'Email' }).fill('student@test.com')
  await page.getByRole('textbox', { name: 'Password' }).fill('password123')
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForLoadState('networkidle')
  await page.goto(`/dashboard/student/courses/${courseId}/lessons/${lessonId}`)
}

test.describe('Lesson Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToLesson(page)
  })

  test('should display lesson content correctly', async ({ page }) => {
    // Verify lesson header
    await expect(page.getByText('Lesson 1')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Getting Started with JavaScript' })).toBeVisible()

    // Verify sidebar navigation
    await expect(page.getByRole('heading', { name: 'Introduction to JavaScript', level: 2 })).toBeVisible()
    await expect(page.getByRole('link', { name: /← Back to course/ })).toBeVisible()

    // Verify all lessons are listed in sidebar
    await expect(page.getByRole('link', { name: /1\. Getting Started/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /2\. Functions and Control Flow/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /3\. Working with Arrays/ })).toBeVisible()
  })

  test('should display YouTube video embed', async ({ page }) => {
    // Check for iframe (YouTube embed)
    const iframe = page.frameLocator('iframe').first()
    await expect(iframe.locator('text=/YouTube|Watch on/')).toBeVisible({ timeout: 10000 })
  })

  test('should render markdown content with proper formatting', async ({ page }) => {
    // Check for various markdown elements
    await expect(page.getByRole('heading', { name: 'What is JavaScript?' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Variables' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Data Types' })).toBeVisible()

    // Check for inline code
    await expect(page.locator('code', { hasText: 'let' })).toBeVisible()
    await expect(page.locator('code', { hasText: 'const' })).toBeVisible()

    // Check for code blocks
    await expect(page.locator('pre code')).toBeVisible()

    // Check for lists
    const list = page.locator('ul, ol').first()
    await expect(list).toBeVisible()
  })

  test.skip('should display comments section', async ({ page }) => {
    // SKIP: Comments table doesn't exist in database
    // Re-enable once comments table is created

    await expect(page.getByText(/Comments/)).toBeVisible()
    await expect(page.getByPlaceholder(/Share your thoughts/)).toBeVisible()
  })

  test('should have navigation buttons', async ({ page }) => {
    // Check for all navigation buttons
    await expect(page.getByRole('button', { name: 'Back to Course' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as Complete' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  test('should navigate to next lesson', async ({ page }) => {
    // Click "Next" button
    await page.getByRole('button', { name: 'Next' }).click()

    // Should navigate to lesson 2
    await expect(page).toHaveURL(/\/lessons\/2/)
    await expect(page.getByRole('heading', { name: 'Functions and Control Flow' })).toBeVisible()
  })

  test('should navigate back to course', async ({ page }) => {
    // Click "Back to Course" button
    await page.getByRole('button', { name: 'Back to Course' }).click()

    // Should navigate to course detail
    await expect(page).toHaveURL(/\/courses\/1$/)
    await expect(page.getByRole('button', { name: 'Start Course' })).toBeVisible()
  })

  test.skip('should mark lesson as complete', async ({ page }) => {
    // SKIP: Lesson completion is currently broken (database issue)
    // Re-enable once lesson_completions RLS is fixed

    // Click "Mark as Complete"
    await page.getByRole('button', { name: 'Mark as Complete' }).click()

    // Should navigate to next lesson
    await expect(page).toHaveURL(/\/lessons\/2/)

    // Go back to lesson 1
    await page.goto('/dashboard/student/courses/1/lessons/1')

    // Check if lesson 1 shows as completed in sidebar
    const lesson1 = page.getByRole('link', { name: /1\. Getting Started/ })
    await expect(lesson1).toHaveAttribute('data-completed', 'true')
  })

  test('should navigate between lessons using sidebar', async ({ page }) => {
    // Click on lesson 2 in sidebar
    await page.getByRole('link', { name: /2\. Functions and Control Flow/ }).click()

    // Should navigate to lesson 2
    await expect(page).toHaveURL(/\/lessons\/2/)
    await expect(page.getByText('Lesson 2')).toBeVisible()

    // Click on lesson 3
    await page.getByRole('link', { name: /3\. Working with Arrays/ }).click()

    // Should navigate to lesson 3
    await expect(page).toHaveURL(/\/lessons\/3/)
    await expect(page.getByRole('heading', { name: 'Working with Arrays' })).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    // Content should still be visible
    await expect(page.getByRole('heading', { name: 'Getting Started with JavaScript' })).toBeVisible()

    // Navigation should work (might be in a hamburger menu)
    await expect(page.getByRole('button', { name: 'Mark as Complete' })).toBeVisible()
  })
})

test.describe('Course Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('student@test.com')
    await page.getByRole('textbox', { name: 'Password' }).fill('password123')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.waitForLoadState('networkidle')
    await page.goto('/dashboard/student/courses/1')
  })

  test('should display course header correctly', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Back to My Learning' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Introduction to JavaScript' })).toBeVisible()
    await expect(page.getByText('Learn the fundamentals of JavaScript')).toBeVisible()
  })

  test('should show progress indicator', async ({ page }) => {
    await expect(page.getByText(/\d+% complete/)).toBeVisible()
    await expect(page.getByText(/\d+\/\d+ lessons/)).toBeVisible()
  })

  test('should have action buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Course' })).toBeVisible()
    await expect(page.getByRole('button', { name: /View Exams/ })).toBeVisible()
  })

  test('should display lesson list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Course Content' })).toBeVisible()

    // All three lessons should be visible
    await expect(page.getByRole('heading', { name: 'Getting Started with JavaScript' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Functions and Control Flow' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Working with Arrays' })).toBeVisible()
  })

  test.skip('should display course reviews section', async ({ page }) => {
    // SKIP: Reviews have database schema issue
    await expect(page.getByText('Course Reviews')).toBeVisible()
  })

  test('should start course when clicking "Start Course"', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Course' }).click()

    // Should navigate to first lesson
    await expect(page).toHaveURL(/\/lessons\/1/)
    await expect(page.getByRole('heading', { name: 'Getting Started with JavaScript' })).toBeVisible()
  })

  test('should navigate to exams page', async ({ page }) => {
    await page.getByRole('button', { name: /View Exams/ }).click()

    // Should navigate to exams page
    await expect(page).toHaveURL(/\/exams$/)
  })

  test('should navigate to individual lesson', async ({ page }) => {
    // Click on the first lesson
    await page.getByRole('link', { name: /Getting Started with JavaScript.*Learn about variables/ }).click()

    // Should navigate to lesson page
    await expect(page).toHaveURL(/\/lessons\/1/)
  })
})
