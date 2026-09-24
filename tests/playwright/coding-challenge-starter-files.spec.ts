import { test, expect } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'
import { getAdmin } from './utils/plan-gate-fixtures'

/**
 * #844 — the student's coding-challenge page filtered `exercise_files` and
 * `exercise_code_student_submissions` by a `tenant_id` neither table has.
 * PostgREST answered 42703, `data` came back null, and the editor opened on
 * the Sandpack template instead of the teacher's starter files.
 *
 * Seed: exercise 2001 (FizzBuzz, coding_challenge) in course 2001, Code
 * Academy; alice@student.com reaches it through the Pro Monthly plan.
 */

const COURSE_ID = 2001
const EXERCISE_ID = 2001
const MARKER = `e2e-844-starter-${Date.now()}`

test.describe('Coding challenge — starter files (#844)', () => {
  test.beforeAll(async () => {
    const { error } = await getAdmin()
      .from('exercise_files')
      .insert({
        exercise_id: EXERCISE_ID,
        file_path: '/App.js',
        content: `// ${MARKER}\nexport default function App() {\n  return <h1>${MARKER}</h1>\n}\n`,
        file_type: 'code',
      })
    if (error) throw new Error(`seed exercise_files: ${error.message}`)
  })

  test.afterAll(async () => {
    await getAdmin().from('exercise_files').delete().eq('exercise_id', EXERCISE_ID).like('content', `%${MARKER}%`)
  })

  test('the editor opens on the exercise starter file', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/exercises/${EXERCISE_ID}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('.sp-code-editor .cm-content').first()).toContainText(MARKER, { timeout: 60_000 })
  })
})
