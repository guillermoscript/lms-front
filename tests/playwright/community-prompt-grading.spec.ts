/**
 * Graded discussion prompts — issue #873.
 *
 *   create   the teacher adds a GRADED prompt with a due date from the course
 *            page's lesson shortcut
 *   answer   Alice answers it on the lesson; she sees the due badge and
 *            "not graded yet"
 *   grade    the teacher dashboard's grading queue links to the prompt's
 *            grading view; the teacher scores Alice 85 with feedback
 *   see      Alice sees her score and feedback on the lesson, in the feed and
 *            on her progress page; she is notified and earned the XP
 *   privacy  another student of the course sees no grade — in the UI or
 *            through RLS (the native app's path)
 *
 * Who may grade whom, cross-tenant and the re-grade rules are pinned in SQL
 * (tests/sql/issue-873-community-prompt-grades.sql).
 *
 * Runs on Code Academy (community enabled). B is a throwaway student; every
 * post carries MARK and is removed afterwards (grades, comments and
 * notifications cascade). Desktop only: it writes shared rows.
 */
import { test, expect, type Browser, type Page } from './utils/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { login, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const COURSE_ID = 2001 // Python for Beginners — Alice has access; the creator wrote it
const LESSON_ID = 2001
const LESSON_TITLE = 'Python Variables and Types'

const RUN = Date.now()
const MARK = `[E2E] 873 ${RUN}`
const TITLE = `${MARK} Explain a variable`
const ANSWER = `${MARK} A variable is a name bound to a value.`
const FEEDBACK = 'Clear and correct — add an example next time.'
const B_EMAIL = `qa-873-b-${RUN}@e2etest.com`
const B_PASSWORD = 'password123'

const TEACHER_COURSE = `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}`
const TEACHER_DASHBOARD = `${TENANT_BASE}/${LOCALE}/dashboard/teacher`
const LESSON = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/lessons/${LESSON_ID}`
const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const PROGRESS = `${TENANT_BASE}/${LOCALE}/dashboard/student/progress`

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function newPage(browser: Browser, signIn: (page: Page) => Promise<void>) {
  const page = await (await browser.newContext()).newPage()
  await signIn(page)
  return page
}

// base-ui triggers ignore Playwright's synthetic pointer sequence; a DOM click lands.
async function press(locator: ReturnType<Page['locator']>) {
  await expect(locator).toBeVisible({ timeout: 20_000 })
  await locator.evaluate((el: HTMLElement) => el.click())
}

function promptArticle(page: Page) {
  return page.getByRole('region', { name: 'Discussion' }).getByRole('article', { name: TITLE })
}

/** YYYY-MM-DD, `days` from today, in the browser's (and this process's) timezone. */
function localDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function removeMarkedPosts() {
  const db = admin()
  const { data } = await db
    .from('community_posts')
    .select('id')
    .eq('tenant_id', CODE_ACADEMY)
    .or(`content.ilike.%[E2E] 873%,title.ilike.%[E2E] 873%`)
    .limit(1000)
  const ids = (data ?? []).map((p) => p.id as string)
  if (ids.length) await db.from('community_posts').delete().in('id', ids)
}

let promptId = ''
let bId = ''

const RUNS_IN = ['desktop-chromium', 'human']

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
  test.skip(!RUNS_IN.includes(testInfo.project.name), 'runs once — DB state is shared')
})

test.beforeAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  const db = admin()
  await removeMarkedPosts()
  await db.from('community_user_blocks').delete().eq('blocker_id', ALICE_ID).eq('blocked_id', CREATOR_ID)
  await db.from('community_user_mutes').delete().eq('tenant_id', CODE_ACADEMY).eq('user_id', ALICE_ID)

  const { data: created, error } = await db.auth.admin.createUser({
    email: B_EMAIL,
    password: B_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'QA Classmate 873' },
    app_metadata: { tenant_id: CODE_ACADEMY },
  })
  expect(error).toBeNull()
  bId = created.user!.id
  const membership = await db
    .from('tenant_users')
    .upsert({ tenant_id: CODE_ACADEMY, user_id: bId, role: 'student', status: 'active' }, { onConflict: 'tenant_id,user_id' })
  expect(membership.error).toBeNull()
  const entitlement = await db
    .from('entitlements')
    .insert({ user_id: bId, course_id: COURSE_ID, tenant_id: CODE_ACADEMY, source_type: 'admin_grant' })
  expect(entitlement.error).toBeNull()
  // Enrolled, so the grading roster lists B even without an answer.
  const enrollment = await db
    .from('enrollments')
    .insert({ user_id: bId, course_id: COURSE_ID, tenant_id: CODE_ACADEMY, status: 'active' })
  expect(enrollment.error).toBeNull()
})

test.afterAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  await removeMarkedPosts()
  if (bId) await admin().auth.admin.deleteUser(bId)
})

test('the teacher creates a graded prompt with a due date', async ({ browser }) => {
  test.setTimeout(180_000)
  const teacher = await newPage(browser, loginAsAdmin)
  await teacher.goto(TEACHER_COURSE)
  await press(teacher.getByRole('button', { name: `Add discussion prompt to “${LESSON_TITLE}”` }))
  const sheet = teacher.getByRole('dialog', { name: 'New discussion prompt' })
  await expect(sheet).toBeVisible({ timeout: 10_000 })

  await sheet.getByLabel('Prompt Title').fill(TITLE)
  await sheet.getByLabel('Prompt Content').fill(`${MARK} In your own words, what is a variable?`)
  await press(sheet.getByRole('switch'))
  const due = sheet.getByLabel('Due date (optional)')
  await expect(due).toBeVisible({ timeout: 10_000 })
  await due.fill(localDate(3))
  await press(sheet.getByRole('button', { name: 'Create Discussion Prompt' }))
  await expect(sheet).toBeHidden({ timeout: 20_000 })

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_posts')
          .select('id, is_graded, due_at, lesson_id')
          .eq('tenant_id', CODE_ACADEMY)
          .eq('title', TITLE)
        promptId = (data?.[0]?.id as string) ?? ''
        return data?.[0] ? { is_graded: data[0].is_graded, has_due: data[0].due_at !== null, lesson_id: data[0].lesson_id } : null
      },
      { timeout: 20_000 }
    )
    .toEqual({ is_graded: true, has_due: true, lesson_id: LESSON_ID })
  await teacher.context().close()
})

test('the student answers on the lesson and sees it is not graded yet', async ({ browser }) => {
  test.setTimeout(180_000)
  expect(promptId).not.toBe('')
  const student = await newPage(browser, loginAsTenantStudent)
  await student.goto(LESSON)
  const article = promptArticle(student)
  await expect(article).toBeVisible({ timeout: 30_000 })
  await expect(article.getByTestId('prompt-due')).toHaveText(/Due in (3|4) days/, { timeout: 10_000 })

  await press(article.getByRole('button', { name: 'Answer', exact: true }))
  const box = article.getByRole('textbox', { name: 'Your answer' })
  await expect(box).toBeFocused({ timeout: 10_000 })
  await box.fill(ANSWER)
  await press(article.getByRole('button', { name: 'Post answer' }))
  // Posted once the count moves (the first post compiles the action in dev).
  await expect(article).toContainText('1 answer', { timeout: 60_000 })
  await expect(article).toContainText('You answered')
  await expect(article.getByTestId('prompt-grade-pending')).toBeVisible({ timeout: 10_000 })
  await expect(article.getByTestId('prompt-grade')).toHaveCount(0)
  await student.context().close()
})

test('the teacher grades the answer from the grading queue', async ({ browser }) => {
  test.setTimeout(180_000)
  expect(promptId).not.toBe('')
  const teacher = await newPage(browser, loginAsAdmin)

  // The dashboard's queue lists the prompt and opens its grading view.
  await teacher.goto(TEACHER_DASHBOARD)
  const card = teacher.getByTestId('prompts-to-grade-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  const link = card.locator(`a[href*="/community/prompts/${promptId}"]`)
  await expect(link).toBeVisible()
  await press(link)
  // First visit compiles the route in dev.
  await teacher.waitForURL(new RegExp(`/courses/${COURSE_ID}/community/prompts/${promptId}`), { timeout: 90_000 })
  await expect(teacher.getByTestId('grading-title')).toHaveText('Grade answers', { timeout: 30_000 })

  const alice = teacher.locator(`[data-testid="grading-row"][data-student-id="${ALICE_ID}"]`)
  await expect(alice).toBeVisible({ timeout: 20_000 })
  await expect(alice).toHaveAttribute('data-status', 'ungraded')
  await expect(alice.getByText(ANSWER)).toBeVisible()

  // The classmate never answered: listed under "Not answered".
  await press(teacher.getByTestId('grading-filter-unanswered'))
  await expect(teacher.locator(`[data-testid="grading-row"][data-student-id="${bId}"]`)).toHaveAttribute(
    'data-status',
    'unanswered',
    { timeout: 10_000 }
  )
  await press(teacher.getByTestId('grading-filter-ungraded'))

  await alice.getByTestId('grading-score').fill('85')
  await alice.getByTestId('grading-feedback').fill(FEEDBACK)
  await press(alice.getByTestId('grading-save'))
  await expect(alice).toHaveAttribute('data-status', 'graded', { timeout: 20_000 })
  await expect(alice.getByTestId('grading-row-score')).toHaveText('85/100')

  const { data: grade } = await admin()
    .from('community_prompt_grades')
    .select('score, feedback, graded_by, student_id')
    .eq('post_id', promptId)
    .eq('student_id', ALICE_ID)
    .single()
  expect(grade).toMatchObject({ score: 85, feedback: FEEDBACK, graded_by: CREATOR_ID })
  await teacher.context().close()
})

test('the student sees her score and feedback, is notified and earned XP', async ({ browser }) => {
  // Three pages, each compiled on first visit in dev.
  test.setTimeout(300_000)
  expect(promptId).not.toBe('')

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('user_notifications')
          .select('id, notification:notifications!inner(metadata, community_post_id)')
          .eq('user_id', ALICE_ID)
          .eq('notification.community_post_id', promptId)
          .limit(10)
        return (data ?? [])
          .map((r) => (r.notification as unknown as { metadata: { kind?: string; score?: number } }).metadata)
          .filter((m) => m.kind === 'community_prompt_graded')
          .map((m) => m.score)
      },
      { timeout: 15_000 }
    )
    .toEqual([85])

  const { count: xp } = await admin()
    .from('gamification_xp_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ALICE_ID)
    .eq('action_type', 'community_prompt_graded')
    .eq('reference_id', promptId)
  expect(xp).toBe(1)

  const student = await newPage(browser, loginAsTenantStudent)

  await student.goto(LESSON)
  const article = promptArticle(student)
  await expect(article.getByTestId('prompt-grade-score')).toHaveText('85/100', { timeout: 30_000 })
  await expect(article.getByTestId('prompt-grade-feedback')).toHaveText(FEEDBACK)

  await student.goto(`${COURSE_FEED}?post=${promptId}`)
  const post = student.locator(`#post-${promptId}`)
  await expect(post.getByTestId('prompt-grade-score')).toHaveText('85/100', { timeout: 30_000 })
  await expect(post.getByTestId('prompt-grade-feedback')).toHaveText(FEEDBACK)
  // A student never gets the grading link.
  await expect(post.getByTestId('prompt-grade-link')).toHaveCount(0)

  await student.goto(PROGRESS)
  const grades = student.getByTestId('progress-discussion-grades')
  await expect(grades.getByText(`${TITLE} — 85/100`)).toBeVisible({ timeout: 30_000 })
  await student.context().close()
})

test('another student sees no one else’s grade', async ({ browser }) => {
  test.setTimeout(180_000)
  expect(promptId).not.toBe('')

  const classmate = await newPage(browser, (page) => login(page, B_EMAIL, B_PASSWORD, TENANT_BASE))
  await classmate.goto(`${COURSE_FEED}?post=${promptId}`)
  const post = classmate.locator(`#post-${promptId}`)
  await expect(post).toBeVisible({ timeout: 30_000 })
  await expect(post.getByTestId('prompt-grade')).toHaveCount(0)
  await classmate.context().close()

  // Through RLS (the native app's path): no row, and no way to write one.
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: signInError } = await client.auth.signInWithPassword({ email: B_EMAIL, password: B_PASSWORD })
  expect(signInError).toBeNull()
  const { data: rows } = await client.from('community_prompt_grades').select('id, score').eq('post_id', promptId)
  expect(rows ?? []).toEqual([])
  const { error: insertError } = await client
    .from('community_prompt_grades')
    .insert({ tenant_id: CODE_ACADEMY, post_id: promptId, student_id: bId, score: 100, graded_by: bId })
  expect(insertError).not.toBeNull()
})
