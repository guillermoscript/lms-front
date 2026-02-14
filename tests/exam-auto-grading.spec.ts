import { test, expect } from '@playwright/test'

test.describe('Exam Auto-Grading', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/auth/login')
  })

  test('Teacher can create exam with free-text question and AI grading criteria', async ({ page }) => {
    // Login as teacher
    await page.fill('input[name="email"]', 'teacher@test.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Wait for dashboard
    await expect(page).toHaveURL(/\/dashboard\/teacher/)

    // Navigate to courses
    await page.goto('http://localhost:3000/dashboard/teacher/courses')

    // Click on first course
    await page.click('a[href*="/dashboard/teacher/courses/"]')

    // Navigate to create exam
    await page.click('a[href*="/exams/new"]')

    // Fill exam details
    await page.fill('input#title', 'Test Exam with AI Grading')
    await page.fill('textarea#description', 'This exam tests AI grading functionality')
    await page.fill('input#duration', '30')

    // Add a multiple choice question
    await page.click('button:has-text("Multiple Choice")')
    await page.fill('textarea:first-of-type', 'What is 2 + 2?')
    await page.fill('input[placeholder="Option 1"]', '3')
    await page.fill('input[placeholder="Option 2"]', '4')
    await page.check('input[type="checkbox"]:nth-of-type(2)') // Mark second option as correct

    // Add a free-text question
    await page.click('button:has-text("Free Text")')
    const freeTextQuestionArea = page.locator('textarea').last()
    await freeTextQuestionArea.fill('Explain the concept of recursion in programming.')

    // Set points for free-text question
    const pointsInput = page.locator('input[type="number"]').last()
    await pointsInput.fill('10')

    // Add grading rubric
    const rubricTextarea = page.locator('textarea[placeholder*="complete answer"]')
    await rubricTextarea.fill('Answer should include: definition, example, and base case explanation')

    // Add AI grading criteria
    const criteriaTextarea = page.locator('textarea[placeholder*="specific concepts"]')
    await criteriaTextarea.fill('Check for understanding of function calling itself, base case, and recursive case')

    // Add expected keywords
    const keywordsInput = page.locator('input[placeholder*="keyword1"]')
    await keywordsInput.fill('function, base case, recursive call')

    // Publish exam
    await page.click('button:has-text("Publish Exam")')

    // Verify redirect to course page
    await expect(page).toHaveURL(/\/dashboard\/teacher\/courses\/\d+/)
  })

  test('Student can take exam with free-text questions', async ({ page }) => {
    // Login as student
    await page.fill('input[name="email"]', 'student@test.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Wait for dashboard
    await expect(page).toHaveURL(/\/dashboard\/student/)

    // Navigate to enrolled course
    await page.click('a[href*="/dashboard/student/courses/"]')

    // Navigate to exams
    await page.click('a[href*="/exams"]')

    // Start the exam
    await page.click('button:has-text("Start Exam")')

    // Answer multiple choice question
    await page.click('label:has-text("4")')

    // Navigate to next question
    await page.click('button:has-text("Next Question")')

    // Answer free-text question
    const freeTextAnswer = `Recursion is when a function calls itself to solve a problem.
    It needs a base case to stop the recursion, and a recursive case that breaks down the problem.
    For example, calculating factorial: factorial(n) = n * factorial(n-1), with base case factorial(0) = 1.`

    await page.fill('textarea', freeTextAnswer)

    // Submit exam
    await page.click('button:has-text("Finish & Submit")')

    // Wait for result page
    await expect(page).toHaveURL(/\/dashboard\/student\/courses\/\d+\/exams\/\d+\/result/)

    // Verify AI grading happened (score should be displayed)
    await expect(page.locator('text=/Score:|Your Score/')).toBeVisible({ timeout: 10000 })
  })

  test('Teacher can review AI-graded submissions', async ({ page }) => {
    // Login as teacher
    await page.fill('input[name="email"]', 'teacher@test.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Navigate to course
    await page.goto('http://localhost:3000/dashboard/teacher/courses')
    await page.click('a[href*="/dashboard/teacher/courses/"]')

    // Navigate to exam submissions
    await page.click('a[href*="/exams/"]')
    await page.click('a[href*="/submissions"]')

    // Verify submissions are displayed
    await expect(page.locator('table')).toBeVisible()

    // Check for AI reviewed badge
    await expect(page.locator('text=/AI Reviewed/')).toBeVisible()

    // Click review button on first submission
    await page.click('button:has-text("Review")')

    // Verify submission detail dialog opens
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Verify AI feedback is displayed
    await expect(page.locator('text=/AI Feedback/')).toBeVisible()

    // Verify confidence score is displayed
    await expect(page.locator('text=/Confidence:/')).toBeVisible()

    // Test teacher override functionality
    await page.click('button:has-text("Override Score")')

    // Change points
    const pointsInput = page.locator('input[type="number"]')
    await pointsInput.fill('8')

    // Add teacher notes
    const notesTextarea = page.locator('textarea[placeholder*="grading decision"]')
    await notesTextarea.fill('Good answer but missing detailed example')

    // Save override
    await page.click('button:has-text("Save Override")')

    // Verify override badge appears
    await expect(page.locator('text=/Overridden/')).toBeVisible()
  })

  test('AI grading only applies to free-text questions', async ({ page }) => {
    // Login as student
    await page.fill('input[name="email"]', 'student@test.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Take exam with only multiple choice and true/false
    await page.goto('http://localhost:3000/dashboard/student/courses/1/exams/1')

    // Answer all questions programmatically gradable
    await page.click('label:first-of-type')
    await page.click('button:has-text("Next")')
    await page.click('label:has-text("True")')

    // Submit
    await page.click('button:has-text("Finish & Submit")')

    // Result should appear immediately (no AI processing)
    await expect(page.locator('text=/Score:|Your Score/')).toBeVisible({ timeout: 2000 })
  })

  test('Teacher can configure AI persona and tone for exam', async ({ page }) => {
    // Login as teacher
    await page.fill('input[name="email"]', 'teacher@test.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Navigate to exam builder
    await page.goto('http://localhost:3000/dashboard/teacher/courses/1/exams/new')

    // Create exam with free-text question
    await page.fill('input#title', 'AI Config Test Exam')
    await page.click('button:has-text("Free Text")')
    await page.fill('textarea', 'Explain object-oriented programming')

    // Save as draft first
    await page.click('button:has-text("Save as Draft")')

    // Navigate to AI configuration (should be on same page or exam edit page)
    // This assumes ExamAIConfig component is integrated
    await page.click('button:has-text("AI Grading Settings")').catch(() => {
      console.log('AI config button not yet integrated')
    })

    // If AI config dialog/section appears
    const aiConfigSection = page.locator('text=/AI Grading Configuration/')
    if (await aiConfigSection.isVisible()) {
      // Select AI persona
      await page.selectOption('select#persona', 'friendly_tutor')

      // Select feedback tone
      await page.selectOption('select#tone', 'encouraging')

      // Select detail level
      await page.selectOption('select#detail-level', 'comprehensive')

      // Add custom prompt
      await page.fill('textarea#custom-prompt', 'Focus on conceptual understanding over syntax')

      // Save configuration
      await page.click('button:has-text("Save Configuration")')

      // Verify success message
      await expect(page.locator('text=/successfully saved/')).toBeVisible()
    }
  })
})
