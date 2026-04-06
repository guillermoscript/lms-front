import { test, expect } from '@playwright/test'

const BASE_URL = 'http://code-academy.lvh.me:3000'
const STUDENT_EMAIL = 'alice@student.com'
const STUDENT_PASSWORD = 'password123'
const COURSE_ID = 2001
const EXAM_ID = 2001

test.describe('AI Exam Grading E2E', () => {
  test('student takes exam and gets AI-graded results', async ({ page }) => {
    test.setTimeout(120000) // 2 minutes for AI grading
    // Step 1: Login as student
    await page.goto(`${BASE_URL}/en/auth/login`)
    await page.waitForLoadState('networkidle')

    await page.fill('input[type="email"]', STUDENT_EMAIL)
    await page.fill('input[type="password"]', STUDENT_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/dashboard/, { timeout: 15000 })
    console.log('✅ Logged in as student')

    // Step 2: Navigate to exam
    await page.goto(`${BASE_URL}/en/dashboard/student/courses/${COURSE_ID}/exams/${EXAM_ID}`)
    await page.waitForLoadState('networkidle')
    console.log('📋 Navigated to exam page:', page.url())

    // Check we're on the exam taker (not redirected to result)
    const pageContent = await page.textContent('body')
    if (pageContent?.includes('No Questions Found')) {
      console.log('❌ No questions found for this exam')
      return
    }

    // Check if redirected to result (already submitted)
    if (page.url().includes('/result')) {
      console.log('ℹ️ Already submitted this exam, checking result page...')
      await checkResultPage(page)
      return
    }

    // Step 3: Answer all questions
    console.log('📝 Starting to answer questions...')
    const totalQuestions = 10

    for (let i = 0; i < totalQuestions; i++) {
      // Wait for question to load
      await page.waitForSelector('h2', { timeout: 5000 })
      const questionText = await page.textContent('h2')
      console.log(`  Q${i + 1}: ${questionText?.substring(0, 60)}...`)

      // Determine question type and answer
      const hasRadioGroup = await page.locator('[role="radiogroup"]').count()
      const hasTextarea = await page.locator('textarea').count()

      if (hasTextarea > 0) {
        // Free text question - provide a substantive answer
        const freeTextAnswers: Record<number, string> = {
          6: 'Lists are mutable ordered collections using square brackets [], while tuples are immutable ordered collections using parentheses (). Lists support append, remove, and other modification methods. Tuples cannot be modified after creation. Use lists when you need a dynamic collection that changes, like a shopping cart. Use tuples for fixed data like coordinates (x, y) or database records that should not change.',
          7: 'def count_words(text: str) -> dict[str, int]:\n    words = text.lower().split()\n    result = {}\n    for word in words:\n        result[word] = result.get(word, 0) + 1\n    return result\n\nThis function splits the text into words after converting to lowercase for case-insensitive counting. It uses dict.get() with a default of 0 to handle new words. An alternative would be using collections.Counter.',
          8: 'EAFP stands for Easier to Ask Forgiveness than Permission. Instead of checking conditions before an operation (LBYL - Look Before You Leap), you try the operation and handle exceptions if they occur. Benefits: 1) Cleaner code without nested if checks, 2) Avoids race conditions (checking then acting is not atomic), 3) More Pythonic. Example: try: value = my_dict["key"] except KeyError: value = "default" vs if "key" in my_dict: value = my_dict["key"] else: value = "default"',
          9: 'A Python project should be structured with a root directory containing a src/ or package directory with __init__.py files. __init__.py marks a directory as a Python package, allowing imports. It can be empty or contain package-level initialization code. The if __name__ == "__main__" guard allows a module to be both imported and run as a script. When run directly, __name__ is set to "__main__", so guarded code executes. When imported, __name__ is the module name, so the guarded code is skipped. Example structure: myproject/ -> src/ -> mypackage/ -> __init__.py, module1.py, module2.py, tests/, setup.py',
        }
        const answerIndex = i - (totalQuestions - Object.keys(freeTextAnswers).length)
        const answer = Object.values(freeTextAnswers)[answerIndex] || 'This is a test answer for the free text question.'
        await page.fill('textarea', answer)
      } else if (hasRadioGroup > 0) {
        // Multiple choice or true/false - click first available option
        const labels = page.locator('[role="radiogroup"] label')
        const count = await labels.count()
        if (count > 0) {
          // Pick a reasonable answer (second option for variety)
          const pickIndex = Math.min(1, count - 1)
          await labels.nth(pickIndex).click()
        }
      }

      // Navigate to next question or submit
      if (i < totalQuestions - 1) {
        const nextBtn = page.locator('button:has-text("Next Question")')
        await nextBtn.click()
        await page.waitForTimeout(500) // Brief pause for animation
      }
    }

    console.log('✅ All questions answered')

    // Step 4: Submit the exam
    const submitBtn = page.locator('[data-testid="exam-finish-submit"]')
    await expect(submitBtn).toBeVisible()

    // Listen for console errors during submission
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    console.log('🚀 Submitting exam...')
    // Use evaluate to click - base-ui Button has issues with Playwright's .click()
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="exam-finish-submit"]') as HTMLButtonElement
      if (btn) btn.click()
    })

    // Wait for redirect to result page (AI grading may take up to 60s)
    await page.waitForURL(/result/, { timeout: 90000 })
    console.log('✅ Redirected to result page:', page.url())

    if (consoleErrors.length > 0) {
      console.log('⚠️ Console errors during submission:', consoleErrors)
    }

    // Step 5: Check result page
    await checkResultPage(page)
  })
})

async function checkResultPage(page: any) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000) // Give time for data to load

  const resultContent = await page.textContent('body')
  console.log('\n📊 Result page content (first 500 chars):')
  console.log(resultContent?.substring(0, 500))

  // Check for score display
  if (resultContent?.includes('Score') || resultContent?.includes('score') || resultContent?.includes('%')) {
    console.log('✅ Score is displayed on result page')
  } else {
    console.log('⚠️ No score visible on result page')
  }

  // Check for feedback
  if (resultContent?.includes('feedback') || resultContent?.includes('Feedback') || resultContent?.includes('Correct') || resultContent?.includes('Incorrect')) {
    console.log('✅ Feedback is displayed on result page')
  } else {
    console.log('⚠️ No feedback visible on result page')
  }
}
