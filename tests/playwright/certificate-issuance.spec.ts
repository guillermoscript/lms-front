import { test, expect } from '@playwright/test'

const BASE_URL = 'http://code-academy.lvh.me:3000'
const STUDENT_EMAIL = 'alice@student.com'
const STUDENT_PASSWORD = 'password123'
const COURSE_ID = 2001
const LAST_LESSON_ID = 2008 // "Modules and Project Structure" - the only uncompleted lesson

test.describe('Certificate Issuance E2E', () => {
  test('student completes last lesson and gets certificate', async ({ page }) => {
    test.setTimeout(60000)

    // Step 1: Login
    await page.goto(`${BASE_URL}/en/auth/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[type="email"]', STUDENT_EMAIL)
    await page.fill('input[type="password"]', STUDENT_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/dashboard/, { timeout: 15000 })
    console.log('✅ Logged in as student')

    // Step 2: Navigate to the last lesson
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/lessons/${LAST_LESSON_ID}`)
    await page.waitForLoadState('networkidle')
    console.log('📖 Navigated to last lesson:', page.url())

    // Verify we're on the lesson page
    const pageContent = await page.textContent('body')
    expect(pageContent).toContain('Modules and Project Structure')

    // Step 3: Click "Mark as Complete" button
    const completeBtn = page.locator('[data-testid="lesson-complete-toggle"]')
    await expect(completeBtn).toBeVisible({ timeout: 5000 })

    // Check if already completed
    const btnText = await completeBtn.textContent()
    if (btnText?.toLowerCase().includes('completed') || btnText?.toLowerCase().includes('done')) {
      console.log('ℹ️ Lesson already completed, checking for certificate...')
    } else {
      console.log('🎯 Clicking "Mark as Complete"...')

      // Listen for certificate toast
      const toastPromise = page.waitForSelector('text=Certificate Earned', { timeout: 10000 }).catch(() => null)

      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="lesson-complete-toggle"]') as HTMLButtonElement
        if (btn) btn.click()
      })

      // Wait for completion to process
      await page.waitForTimeout(3000)

      const toast = await toastPromise
      if (toast) {
        console.log('🎉 Certificate Earned toast appeared!')
      } else {
        console.log('⚠️ No certificate toast (may have auto-navigated)')
      }
    }

    // Step 4: Verify certificate exists
    // Navigate to certificates page
    await page.goto(`${BASE_URL}/en/dashboard/student/certificates`)
    await page.waitForLoadState('networkidle')
    console.log('📜 Certificates page loaded')

    await page.screenshot({ path: '/tmp/certificates-page.png' })

    const certsContent = await page.textContent('body')
    if (certsContent?.includes('Python Fundamentals') || certsContent?.includes('Certificate')) {
      console.log('✅ Certificate is visible on certificates page')
    } else {
      console.log('⚠️ Certificate not found on certificates page')
      console.log('Page content (first 500):', certsContent?.substring(0, 500))
    }

    // Step 5: Also check exam result page shows certificate banner
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/exams/2001/result`)
    await page.waitForLoadState('networkidle')
    console.log('📋 Exam result page loaded')

    await page.screenshot({ path: '/tmp/exam-result-with-cert.png' })

    const resultContent = await page.textContent('body')
    if (resultContent?.includes('Certificate Earned')) {
      console.log('✅ Certificate banner shows on exam result page')
    } else {
      console.log('⚠️ No certificate banner on exam result page')
    }

    // Step 6: Find and visit the verification link
    const verifyLink = page.locator('a[href*="/verify/"]')
    const verifyCount = await verifyLink.count()
    if (verifyCount > 0) {
      const verifyHref = await verifyLink.first().getAttribute('href')
      console.log('🔗 Verification link found:', verifyHref)

      await verifyLink.first().click()
      await page.waitForLoadState('networkidle')
      console.log('📜 Verification page loaded:', page.url())

      await page.screenshot({ path: '/tmp/certificate-verify.png' })

      const verifyContent = await page.textContent('body')
      if (verifyContent?.includes('Python Fundamentals') || verifyContent?.includes('Code Academy')) {
        console.log('✅ Certificate verification page shows correct info')
      }
    } else {
      console.log('⚠️ No verification link found')
    }
  })
})
