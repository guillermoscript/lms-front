/**
 * #844 — the student exercise page filtered `exercise_files` by a `tenant_id`
 * the table does not have. PostgREST answered 42703 with `data = null`, so a
 * coding challenge opened with Sandpack's template instead of the teacher's
 * starter files.
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

let exerciseId: number

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
})

test.afterAll(async () => {
  const admin = getAdmin()
  await admin.from('exercise_files').delete().eq('exercise_id', exerciseId)
  await admin.from('exercises').delete().eq('id', exerciseId)
})

test('a coding challenge opens with the teacher’s starter files (#844)', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsStudent(page)
  await page.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/exercises/${exerciseId}`)

  await expect(page.locator('.cm-content').filter({ hasText: MARKER })).toBeVisible({ timeout: 30_000 })
})
