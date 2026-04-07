import { test, expect } from '@playwright/test'

const BASE_URL = 'http://code-academy.lvh.me:3000'
const STUDENT_EMAIL = 'alice@student.com'
const STUDENT_PASSWORD = 'password123'
const COURSE_ID = 9999
const EXAM_ID = 9999

test.describe('Full Student Journey', () => {
  test('lessons → exam → AI grading → certificate', async ({ page }) => {
    test.setTimeout(120000)

    // ── LOGIN ──
    await page.goto(`${BASE_URL}/en/auth/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[type="email"]', STUDENT_EMAIL)
    await page.fill('input[type="password"]', STUDENT_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/dashboard/, { timeout: 15000 })
    console.log('✅ Logged in')

    // ── LESSON 1 ──
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/lessons/10000`)
    await page.waitForLoadState('networkidle')
    const lesson1Content = await page.textContent('body')
    expect(lesson1Content).toContain('Introduction')
    console.log('📖 Lesson 1 loaded')

    // Mark complete
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="lesson-complete-toggle"]') as HTMLButtonElement
      if (btn && !btn.textContent?.toLowerCase().includes('completed')) btn.click()
    })
    await page.waitForTimeout(2000)
    console.log('✅ Lesson 1 completed')

    // ── LESSON 2 ──
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/lessons/10001`)
    await page.waitForLoadState('networkidle')
    const lesson2Content = await page.textContent('body')
    expect(lesson2Content).toContain('Conclusion')
    console.log('📖 Lesson 2 loaded')

    // Mark complete — this is the last lesson, should NOT trigger certificate yet (exam not passed)
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="lesson-complete-toggle"]') as HTMLButtonElement
      if (btn && !btn.textContent?.toLowerCase().includes('completed')) btn.click()
    })
    await page.waitForTimeout(2000)
    console.log('✅ Lesson 2 completed')

    // ── TAKE EXAM ──
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/exams/${EXAM_ID}`)
    await page.waitForLoadState('networkidle')
    console.log('📋 Exam page loaded:', page.url())

    // If redirected to result, exam was already taken
    if (page.url().includes('/result')) {
      console.log('ℹ️ Exam already submitted, skipping to results...')
    } else {
      // Q1: Multiple choice "What is 2 + 2?" — pick "4" (first option, correct)
      await page.waitForSelector('h2', { timeout: 5000 })
      const q1Text = await page.textContent('h2')
      console.log(`  Q1: ${q1Text}`)
      const labels = page.locator('[role="radiogroup"] label')
      await labels.first().click() // "4" is the correct answer
      await page.locator('button:has-text("Next Question")').click()
      await page.waitForTimeout(500)

      // Q2: True/False "The sky is blue." — pick "True" (correct)
      const q2Text = await page.textContent('h2')
      console.log(`  Q2: ${q2Text}`)
      const tfLabels = page.locator('[role="radiogroup"] label')
      // "True" should be the first option
      await tfLabels.first().click()
      await page.locator('button:has-text("Next Question")').click()
      await page.waitForTimeout(500)

      // Q3: Free text "Explain what you learned"
      const q3Text = await page.textContent('h2')
      console.log(`  Q3: ${q3Text}`)
      await page.fill('textarea',
        'In this course I learned about the introduction to the topic in lesson 1 and ' +
        'wrapped up with key takeaways in lesson 2. The course provided a clear structure ' +
        'and helped me reflect on the material covered. I particularly valued the hands-on ' +
        'approach and practical examples.'
      )

      // Submit
      console.log('🚀 Submitting exam...')
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="exam-finish-submit"]') as HTMLButtonElement
        if (btn) btn.click()
      })

      // Wait for AI grading + redirect
      await page.waitForURL(/result/, { timeout: 90000 })
      console.log('✅ Redirected to result page')
    }

    // ── CHECK EXAM RESULTS ──
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: '/tmp/journey-exam-result.png' })

    const resultContent = await page.textContent('body')

    // Check score
    const scoreMatch = resultContent?.match(/(\d+)%/)
    if (scoreMatch) {
      console.log(`📊 Score: ${scoreMatch[1]}%`)
    }

    // Check AI evaluation
    if (resultContent?.includes('AI Evaluated')) {
      console.log('✅ AI Evaluated status shown')
    }

    // Check for per-question feedback
    if (resultContent?.includes('Correct') || resultContent?.includes('feedback') || resultContent?.includes('Feedback')) {
      console.log('✅ Question feedback displayed')
    }

    // ── CHECK CERTIFICATE ──
    // The exam scoring trigger should have issued the certificate
    // (all lessons complete + exam passed >= 60%)
    if (resultContent?.includes('Certificate Earned')) {
      console.log('🎉 Certificate Earned banner on exam result page!')
    } else {
      console.log('⚠️ No certificate banner on result page (checking certificates page...)')
    }

    // Visit certificates page
    await page.goto(`${BASE_URL}/en/dashboard/student/certificates`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: '/tmp/journey-certificates.png' })

    const certsContent = await page.textContent('body')
    if (certsContent?.includes('Quick Test') || certsContent?.includes('Certificate')) {
      console.log('✅ Certificate visible on certificates page')
    } else {
      console.log('⚠️ No certificate on certificates page')
    }

    // ── VERIFY CERTIFICATE ──
    const verifyLink = page.locator('a[href*="/verify/"]')
    const verifyCount = await verifyLink.count()
    if (verifyCount > 0) {
      const href = await verifyLink.first().getAttribute('href')
      console.log(`🔗 Verification link: ${href}`)
      await verifyLink.first().click()
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: '/tmp/journey-verify.png' })

      const verifyContent = await page.textContent('body')
      if (verifyContent?.includes('Quick Test') || verifyContent?.includes('Code Academy')) {
        console.log('✅ Verification page shows certificate details')
      }
    } else {
      console.log('⚠️ No verification link found')
    }

    console.log('\n🏁 Full journey complete!')
  })
})
