/**
 * Community Q&A — issue #875.
 *
 *   ask      Alice posts a Question from the course feed composer; it shows
 *            "Unanswered"
 *   answer   student B answers in the UI; the creator (staff) answers too and
 *            wears the Teacher badge
 *   refuse   B sees no "Accept answer", and an accept written through RLS (the
 *            native app's path) changes nothing
 *   accept   Alice accepts B's answer: the badge flips to Answered, the answer
 *            is pinned first and highlighted, and B is notified
 *   filters  Questions · Unanswered · Answered narrow the course feed
 *   teacher  the teacher dashboard counts unanswered questions in the
 *            creator's courses and links to the filtered feed
 *
 * The rule itself (who may accept, what may be accepted) is pinned in SQL
 * (tests/sql/issue-875-community-questions.sql).
 *
 * Runs on Code Academy (community enabled). B is a throwaway student; every
 * post carries MARK and is removed afterwards (comments and notifications
 * cascade). Desktop only: it writes shared rows.
 */
import { test, expect, type Page } from './utils/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { login, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const COURSE_ID = 2001 // Python for Beginners — Alice is enrolled (seed); the creator wrote it

const RUN = Date.now()
const MARK = `[E2E] 875 ${RUN}`
const B_EMAIL = `qa-875-b-${RUN}@e2etest.com`
const B_PASSWORD = 'password123'
const B_NAME = 'QA Answerer 875'

const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const TEACHER_DASHBOARD = `${TENANT_BASE}/${LOCALE}/dashboard/teacher`

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

let bId = ''
let questionId = ''
let bAnswerId = ''
let staffAnswerId = ''

async function removeMarkedPosts() {
  const db = admin()
  const { data } = await db.from('community_posts').select('id').like('content', '[E2E] 875%').limit(1000)
  const ids = (data ?? []).map((p) => p.id as string)
  if (ids.length) await db.from('community_posts').delete().in('id', ids)
}

function questionCard(page: Page) {
  return page.locator('div.rounded-xl', { hasText: `${MARK} loop` }).last()
}

async function openComments(page: Page) {
  const card = questionCard(page)
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole('button', { name: /^(Show comments|\d+ comments?)$/ }).click()
  return card
}

const RUNS_IN = ['desktop-chromium', 'human']

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
  test.skip(!RUNS_IN.includes(testInfo.project.name), 'runs once — DB state is shared')
})

test.beforeAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  const db = admin()
  await removeMarkedPosts()

  const { data: created, error } = await db.auth.admin.createUser({
    email: B_EMAIL,
    password: B_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: B_NAME },
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
  await db.from('community_user_mutes').delete().eq('tenant_id', CODE_ACADEMY).in('user_id', [ALICE_ID, bId])
})

test.afterAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  await removeMarkedPosts()
  if (bId) await admin().auth.admin.deleteUser(bId)
})

test('a student asks a question; it shows Unanswered', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAsTenantStudent(page)
  await page.goto(COURSE_FEED)

  const box = page.locator('[data-tour="community-composer"]')
  await expect(box).toBeVisible({ timeout: 30_000 })
  await box.getByRole('button', { name: 'Question' }).click()
  await box.getByRole('textbox', { name: 'Your question in one line' }).fill('Why does my loop never end?')
  await box.getByRole('textbox', { name: "What's on your mind?" }).fill(`${MARK} loop — while True never stops`)
  await box.getByRole('button', { name: /^Post/ }).click()

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_posts')
          .select('id, post_type, accepted_comment_id')
          .eq('tenant_id', CODE_ACADEMY)
          .eq('author_id', ALICE_ID)
          .like('content', `${MARK} loop%`)
          .limit(1)
        questionId = (data?.[0]?.id as string) ?? ''
        return data?.[0]?.post_type ?? ''
      },
      { timeout: 30_000 }
    )
    .toBe('question')

  await expect(questionCard(page).getByTestId('question-status')).toHaveText('Unanswered', { timeout: 30_000 })
})

test('another student answers but cannot accept', async ({ browser }) => {
  test.setTimeout(180_000)
  expect(questionId).not.toBe('')

  // The creator (staff) answers too, through the service role.
  const { data: staff, error: staffError } = await admin()
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY, post_id: questionId, author_id: CREATOR_ID, content: 'Check your loop condition.' })
    .select('id')
    .single()
  expect(staffError).toBeNull()
  staffAnswerId = staff!.id as string

  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, B_EMAIL, B_PASSWORD, TENANT_BASE)
  await page.goto(COURSE_FEED)
  const card = await openComments(page)
  const replyBox = card.getByPlaceholder('Write a reply...').first()
  await expect(replyBox).toBeVisible({ timeout: 20_000 })
  await replyBox.fill('Add a break when the counter reaches 10')
  // The composer's send button comes before every comment's own "Reply".
  await card.getByRole('button', { name: 'Reply', exact: true }).first().click()

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_comments')
          .select('id')
          .eq('post_id', questionId)
          .eq('author_id', bId)
          .limit(1)
        bAnswerId = (data?.[0]?.id as string) ?? ''
        return bAnswerId
      },
      { timeout: 30_000 }
    )
    .not.toBe('')

  // The staff answer wears the Teacher badge; B is offered no Accept.
  const staffAnswer = card.locator(`#comment-${staffAnswerId}`)
  await expect(staffAnswer.getByText('Admin', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(card.getByText('Add a break when the counter reaches 10')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept answer' })).toHaveCount(0)
  await context.close()

  // Through RLS (the native app's path) the accept finds no row to change.
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: signInError } = await client.auth.signInWithPassword({ email: B_EMAIL, password: B_PASSWORD })
  expect(signInError).toBeNull()
  await client.from('community_posts').update({ accepted_comment_id: bAnswerId }).eq('id', questionId)
  const { data: after } = await admin().from('community_posts').select('accepted_comment_id').eq('id', questionId).single()
  expect(after!.accepted_comment_id).toBeNull()
})

test('the asker accepts an answer: Answered, pinned first, answerer notified', async ({ page }) => {
  test.setTimeout(180_000)
  expect(bAnswerId).not.toBe('')

  // A helpful reaction on the staff answer would rank it first — until B's is accepted.
  await admin()
    .from('community_reactions')
    .insert({ tenant_id: CODE_ACADEMY, user_id: ALICE_ID, comment_id: staffAnswerId, reaction_type: 'helpful' })

  await loginAsTenantStudent(page)
  await page.goto(COURSE_FEED)
  const card = await openComments(page)
  const answers = card.locator('[id^="comment-"]')
  await expect(answers.first()).toHaveAttribute('id', `comment-${staffAnswerId}`, { timeout: 20_000 })

  const bAnswer = card.locator(`#comment-${bAnswerId}`)
  await bAnswer.getByRole('button', { name: 'Accept answer' }).click()

  await expect(card.getByTestId('question-status')).toHaveText('Answered', { timeout: 20_000 })
  await expect(answers.first()).toHaveAttribute('id', `comment-${bAnswerId}`, { timeout: 20_000 })
  await expect(bAnswer).toHaveAttribute('data-accepted', '')
  await expect(bAnswer.getByText('Accepted answer')).toBeVisible()
  await expect(bAnswer.getByRole('button', { name: 'Unaccept' })).toBeVisible()

  const { data: post } = await admin()
    .from('community_posts')
    .select('accepted_comment_id, accepted_by, accepted_at')
    .eq('id', questionId)
    .single()
  expect(post).toMatchObject({ accepted_comment_id: bAnswerId, accepted_by: ALICE_ID })
  expect(post!.accepted_at).not.toBeNull()

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('user_notifications')
          .select('id, notification:notifications!inner(metadata, community_post_id)')
          .eq('user_id', bId)
          .eq('notification.community_post_id', questionId)
          .limit(10)
        return (data ?? []).filter(
          (r) => (r.notification as unknown as { metadata: { kind?: string } }).metadata.kind === 'community_answer_accepted'
        ).length
      },
      { timeout: 15_000 }
    )
    .toBe(1)

  // After a reload the server agrees.
  await page.reload()
  await expect(questionCard(page).getByTestId('question-status')).toHaveText('Answered', { timeout: 30_000 })
})

test('Questions · Unanswered · Answered filter the course feed', async ({ page }) => {
  test.setTimeout(180_000)
  // A second, unanswered question.
  const { error } = await admin().from('community_posts').insert({
    tenant_id: CODE_ACADEMY,
    author_id: ALICE_ID,
    course_id: COURSE_ID,
    post_type: 'question',
    content: `${MARK} open question`,
  })
  expect(error).toBeNull()

  await loginAsTenantStudent(page)
  await page.goto(COURSE_FEED)
  const filters = page.locator('[data-tour="community-filters"]')
  await expect(filters).toBeVisible({ timeout: 30_000 })

  await filters.getByRole('button', { name: 'Questions', exact: true }).click()
  await expect(page).toHaveURL(/questions=questions/)
  await expect(page.getByText(`${MARK} loop`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(`${MARK} open question`)).toBeVisible()

  await filters.getByRole('button', { name: 'Unanswered', exact: true }).click()
  await expect(page).toHaveURL(/questions=unanswered/)
  await expect(page.getByText(`${MARK} open question`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(`${MARK} loop`)).toHaveCount(0)

  await filters.getByRole('button', { name: 'Answered', exact: true }).click()
  await expect(page).toHaveURL(/questions=answered/)
  await expect(page.getByText(`${MARK} loop`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(`${MARK} open question`)).toHaveCount(0)
})

test('the teacher dashboard counts unanswered questions and links to the filter', async ({ page }) => {
  test.setTimeout(180_000)
  const { count } = await admin()
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', CODE_ACADEMY)
    .eq('course_id', COURSE_ID)
    .eq('post_type', 'question')
    .eq('is_hidden', false)
    .is('accepted_comment_id', null)
  expect(count ?? 0).toBeGreaterThan(0)

  await loginAsAdmin(page)
  await page.goto(TEACHER_DASHBOARD)
  const card = page.getByTestId('unanswered-questions-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card).toContainText(/\d+ unanswered questions? in your courses/)

  const link = card.locator(`a[href*="/courses/${COURSE_ID}/community?questions=unanswered"]`)
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/courses/${COURSE_ID}/community\\?questions=unanswered`), { timeout: 30_000 })
  await expect(page.getByText(`${MARK} open question`)).toBeVisible({ timeout: 30_000 })
})
