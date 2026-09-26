/**
 * #844 — the student exercise page filtered `exercise_files` by a `tenant_id`
 * the table does not have. PostgREST answered 42703 with `data = null`, so a
 * coding challenge opened with Sandpack's template instead of the teacher's
 * starter files.
 *
 * #858 — nothing wrote exercise_code_student_submissions and the editor
 * ignored it, so a student coming back saw the starter code again.
 *
 * Seed: course 1001 (Default School), student@e2etest.com enrolled.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsStudent } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const TEACHER_ID = 'a1000000-0000-0000-0000-000000000002'
const COURSE_ID = 1001

const EXERCISE_TITLE = '[E2E] #844 Coding challenge starter files'
const FILE_PATH = '/App.js'
const MARKER = 'e2e844StarterMarker'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const STUDENT_EMAIL = 'student@e2etest.com'
const EDIT_MARKER = 'e2e858StudentEdit'
const NATIVE_MARKER = 'e2e858NativeRow'

let exerciseId: number
let studentId: string

async function clearSubmissions() {
  await getAdmin().from('exercise_code_student_submissions').delete().eq('exercise_id', exerciseId)
}

test.beforeAll(async () => {
  const admin = getAdmin()
  // exercise_files cascade with the exercise.
  await admin.from('exercises').delete().eq('title', EXERCISE_TITLE)

  const { data: exercise, error } = await admin
    .from('exercises')
    .insert({
      title: EXERCISE_TITLE,
      instructions: 'Make the component render.',
      exercise_type: 'coding_challenge',
      difficulty_level: 'easy',
      course_id: COURSE_ID,
      created_by: TEACHER_ID,
      tenant_id: DEFAULT_TENANT,
      status: 'published',
      active_file: FILE_PATH,
      visible_files: [FILE_PATH],
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  exerciseId = exercise.id

  const { error: fileError } = await admin.from('exercise_files').insert({
    exercise_id: exerciseId,
    file_path: FILE_PATH,
    file_type: 'code',
    content: `export default function App() {\n  const ${MARKER} = 1\n  return null\n}\n`,
  })
  if (fileError) throw new Error(fileError.message)

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const student = users?.users.find((u) => u.email === STUDENT_EMAIL)
  if (!student) throw new Error(`${STUDENT_EMAIL} not seeded`)
  studentId = student.id
})

test.beforeEach(clearSubmissions)

test.afterAll(async () => {
  const admin = getAdmin()
  await clearSubmissions()
  await admin.from('exercise_files').delete().eq('exercise_id', exerciseId)
  await admin.from('exercises').delete().eq('id', exerciseId)
})

test('a coding challenge opens with the teacher’s starter files (#844)', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsStudent(page)
  await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/exercises/${exerciseId}`)

  await expect(page.locator('.cm-content').filter({ hasText: MARKER })).toBeVisible({ timeout: 30_000 })
})

test('the student’s edits are saved and come back after a reload (#858)', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsStudent(page)
  await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/exercises/${exerciseId}`)

  const editor = page.locator('.cm-content').filter({ hasText: MARKER })
  await expect(editor).toBeVisible({ timeout: 30_000 })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\n// ${EDIT_MARKER}`)

  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15_000 })

  const { data: rows } = await getAdmin()
    .from('exercise_code_student_submissions')
    .select('submission_code, files, user_id')
    .eq('exercise_id', exerciseId)
  expect(rows).toHaveLength(1)
  expect(rows![0].user_id).toBe(studentId)
  // Only the file the student touched, keyed by path; the primary file mirrors it for the native app.
  expect(Object.keys(rows![0].files as Record<string, string>)).toEqual([FILE_PATH])
  expect(rows![0].submission_code).toContain(EDIT_MARKER)

  await page.reload()
  await expect(page.locator('.cm-content').filter({ hasText: EDIT_MARKER })).toBeVisible({ timeout: 30_000 })
})

test('a row saved by the native app restores into the primary file (#858)', async ({ page }) => {
  test.setTimeout(90_000)
  // The native app writes only submission_code, for the active file.
  const { error } = await getAdmin().from('exercise_code_student_submissions').insert({
    exercise_id: exerciseId,
    user_id: studentId,
    submission_code: `export default function App() {\n  const ${NATIVE_MARKER} = 2\n  return null\n}\n`,
  })
  if (error) throw new Error(error.message)

  await loginAsStudent(page)
  await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/exercises/${exerciseId}`)
  await expect(page.locator('.cm-content').filter({ hasText: NATIVE_MARKER })).toBeVisible({ timeout: 30_000 })
})
