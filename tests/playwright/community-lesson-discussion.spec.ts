/**
 * Lesson discussion prompts and feed deep links (#869).
 *
 *   flow      a teacher adds a prompt from the lesson list (pre-filled), the
 *             student answers it on the lesson, the answer is in the feed and
 *             "View in community" lands on it (?post=…#comment-…); Back still
 *             counts it, and deleting it takes the count and the chip down
 *   paging    a deep link to a post beyond page 1 leads the feed, once
 *   hash      an in-app link to another comment on the focused post moves
 *             the highlight without a reload
 *   feeds     ?post= works on all five feeds; another course's post, a school
 *             post on a course feed and an unknown id show the notice
 *   locked    a locked prompt reads, never answers — lesson and feed
 *   hidden    hidden prompts and blocked authors stay out, like the feed
 *   entitled  a subscription-entitled (not enrolled) student sees the prompts
 *   mobile    the discussion is reachable at 390px without sideways overflow
 *   i18n      Spanish labels
 *
 * Runs on Code Academy (community on). Every row carries MARK and is removed
 * afterwards; the one block row is removed by its own test and again here.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE, LOCALE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // admin, author of both courses
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004' // student
const MARK = `[E2E-869 ${Date.now()}]`

const COURSE_ID = 2001 // Python for Beginners — not sequential; alice has a product entitlement
const LESSON_ID = 2001 // "Python Variables and Types"
const LESSON_TITLE = 'Python Variables and Types'
const LOCKED_LESSON_ID = 2002
const OTHER_COURSE_ID = 2002 // Data Analysis with Pandas — alice: subscription entitlement, no enrollment (seed §15b)
const OTHER_LESSON_ID = 2003

const TEACHER_COURSE = `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}`
const LESSON = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/lessons/${LESSON_ID}`
const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const FEEDS = {
  studentSchool: `${TENANT_BASE}/${LOCALE}/dashboard/student/community`,
  studentCourse: COURSE_FEED,
  teacherSchool: `${TENANT_BASE}/${LOCALE}/dashboard/teacher/community`,
  teacherCourse: `${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/community`,
  adminSchool: `${TENANT_BASE}/${LOCALE}/dashboard/admin/community`,
}
const UNAVAILABLE = "This post isn't available. It may have been removed."

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type PostRow = {
  course_id: number | null
  lesson_id?: number | null
  post_type?: 'standard' | 'discussion_prompt'
  title?: string | null
  content: string
  author_id?: string
  is_hidden?: boolean
  is_locked?: boolean
  created_at?: string
}

async function insertPost(row: PostRow): Promise<string> {
  const { data, error } = await admin()
    .from('community_posts')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, author_id: CREATOR_ID, post_type: 'standard', ...row })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

async function insertComment(postId: string, content: string, authorId = CREATOR_ID): Promise<string> {
  const { data, error } = await admin()
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, post_id: postId, author_id: authorId, content })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

async function visiblePromptCount(lessonId: number): Promise<number> {
  const { count } = await admin()
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('course_id', COURSE_ID)
    .eq('lesson_id', lessonId)
    .eq('post_type', 'discussion_prompt')
    .eq('is_hidden', false)
  return count ?? 0
}

async function unblock() {
  await admin().from('community_user_blocks').delete().eq('blocker_id', ALICE_ID).eq('blocked_id', CREATOR_ID)
}

async function newPage(browser: Browser, login: (page: Page) => Promise<void>) {
  const page = await (await browser.newContext()).newPage()
  await login(page)
  return page
}

/** The lesson's discussion section and one prompt in it, by its title. */
function discussion(page: Page, name = 'Discussion') {
  return page.getByRole('region', { name })
}
function promptArticle(page: Page, title: string, name = 'Discussion') {
  return discussion(page, name).getByRole('article', { name: title })
}

// base-ui triggers ignore Playwright's synthetic pointer sequence; a DOM click lands.
async function press(locator: ReturnType<Page['locator']>) {
  await expect(locator).toBeVisible({ timeout: 20_000 })
  await locator.evaluate((el: HTMLElement) => el.click())
}

const BASE_PROMPT = `${MARK} base prompt`
let basePromptId = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await unblock()
  basePromptId = await insertPost({
    course_id: COURSE_ID,
    lesson_id: LESSON_ID,
    post_type: 'discussion_prompt',
    title: BASE_PROMPT,
    content: `${MARK} What surprised you about dynamic typing?`,
  })
})

test.afterAll(async () => {
  await unblock()
  const { data } = await admin()
    .from('community_posts')
    .select('id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .or(`content.ilike.%${MARK}%,title.ilike.%${MARK}%`)
  const ids = (data ?? []).map((p) => p.id)
  if (ids.length) {
    await admin().from('community_comments').delete().in('post_id', ids)
    await admin().from('community_posts').delete().in('id', ids)
  }
})

test('a teacher adds a prompt to a lesson, the student answers it there, and it is in the feed', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const before = await visiblePromptCount(LESSON_ID)
  const title = `${MARK} Which type surprised you?`
  const promptCountText = (n: number) => `${n} discussion prompt${n === 1 ? '' : 's'}`

  // Teacher: the row's shortcut opens the sheet with the lesson already picked.
  const teacher = await newPage(browser, loginAsAdmin)
  await teacher.goto(TEACHER_COURSE)
  await press(teacher.getByRole('button', { name: `Add discussion prompt to “${LESSON_TITLE}”` }))
  const sheet = teacher.getByRole('dialog', { name: 'New discussion prompt' })
  await expect(sheet).toBeVisible({ timeout: 10_000 })
  // The row's overlay link into the lesson editor did not fire.
  expect(new URL(teacher.url()).pathname).toBe(`/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}`)
  // The pre-selection, and the select shows a title rather than a raw id.
  await expect(sheet.getByRole('combobox')).toContainText(LESSON_TITLE)

  await sheet.getByLabel('Prompt Title').fill(title)
  await sheet.getByLabel('Prompt Content').fill(`${MARK} Name one and say why.`)
  await press(sheet.getByRole('button', { name: 'Create Discussion Prompt' }))
  await expect(sheet).toBeHidden({ timeout: 20_000 })

  let promptId = ''
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_posts')
          .select('id, post_type, course_id, lesson_id')
          .eq('tenant_id', CODE_ACADEMY_TENANT)
          .eq('title', title)
        promptId = data?.[0]?.id ?? ''
        return data?.[0] ?? null
      },
      { timeout: 20_000 }
    )
    .toMatchObject({ post_type: 'discussion_prompt', course_id: COURSE_ID, lesson_id: LESSON_ID })

  const row = teacher.locator('[data-slot="card"]', {
    has: teacher.getByRole('heading', { name: LESSON_TITLE, exact: true }),
  })
  await expect(row).toContainText(promptCountText(before + 1), { timeout: 20_000 })

  // Student: the prompt is on the lesson and is answered in place.
  const student = await newPage(browser, loginAsTenantStudent)
  await student.goto(LESSON)
  const article = promptArticle(student, title)
  await expect(article).toBeVisible({ timeout: 30_000 })
  await expect(article).toContainText('No answers yet')

  await press(article.getByRole('button', { name: 'Answer', exact: true }))
  const answerBox = article.getByRole('textbox', { name: 'Your answer' })
  await expect(answerBox).toBeFocused({ timeout: 10_000 })
  const answer = `${MARK} Booleans are ints.`
  await answerBox.fill(answer)
  await press(article.getByRole('button', { name: 'Post answer' }))

  await expect(article.getByText(answer)).toBeVisible({ timeout: 20_000 })
  await expect(article).toContainText('1 answer')
  await expect(article).toContainText('You answered')

  // A reply counts as a reply, not an answer. The reply form's submit is tonal
  // like the rest of the discussion: the lesson's next action stays the one
  // filled element (DESIGN.md).
  await press(article.getByRole('button', { name: 'Reply', exact: true }))
  await expect(article.getByRole('textbox', { name: 'Write a reply...' })).toBeVisible({ timeout: 10_000 })
  await expect(discussion(student).locator('.bg-primary')).toHaveCount(0)
  const reply = `${MARK} and True + True is 2`
  await article.getByRole('textbox', { name: 'Write a reply...' }).fill(reply)
  const replyForm = article.locator('form', { has: student.getByRole('textbox', { name: 'Write a reply...' }) })
  await press(replyForm.getByRole('button', { name: 'Reply', exact: true }))
  await expect(article.getByText(reply)).toBeVisible({ timeout: 20_000 })
  await expect(article).toContainText('1 answer')

  let commentId = ''
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_comments')
          .select('id')
          .eq('post_id', promptId)
          .eq('author_id', ALICE_ID)
          .eq('content', answer)
        commentId = data?.[0]?.id ?? ''
        return commentId
      },
      { timeout: 20_000 }
    )
    .not.toBe('')

  // "View in community" opens the course feed on that post and that answer.
  await press(article.getByRole('link', { name: `View in community: ${title}` }))
  await student.waitForURL(new RegExp(`/community\\?post=${promptId}`), { timeout: 30_000 })
  expect(student.url()).toContain(`#comment-${commentId}`)

  const card = student.locator(`#post-${promptId}`)
  await expect(card).toHaveAttribute('data-focused', '', { timeout: 20_000 })
  await expect(card.getByText(answer)).toBeVisible({ timeout: 20_000 })
  const comment = student.locator(`#comment-${commentId}`)
  await expect(comment).toBeInViewport({ timeout: 10_000 })
  await expect(comment).toBeFocused()

  // Back re-renders the lesson from its cached payload, which predates the
  // answer (answering from the lesson skips revalidation): it still counts.
  await student.goBack()
  const back = promptArticle(student, title)
  await expect(back).toContainText('1 answer', { timeout: 30_000 })
  await expect(back).toContainText('You answered')

  // Deleting it from the lesson takes the count, the chip and the anchor down.
  await press(back.getByRole('button', { name: 'Answer', exact: true }))
  await expect(back.getByText(answer)).toBeVisible({ timeout: 20_000 })
  await press(back.getByRole('button', { name: 'Comment actions' }).first())
  await press(student.getByRole('menuitem', { name: 'Delete Post' }))
  await expect(back.getByText(answer)).toHaveCount(0, { timeout: 20_000 })
  await expect(back).toContainText('No answers yet')
  await expect(back).toContainText('Be the first to answer.')
  await expect(back).not.toContainText('You answered')
  await expect(back.getByRole('link', { name: `View in community: ${title}` })).toHaveAttribute(
    'href',
    new RegExp(`\\?post=${promptId}$`)
  )
})

test('a deep link to a post beyond the first page leads the feed, exactly once', async ({ page }) => {
  test.setTimeout(150_000)
  const oldPrompt = await insertPost({
    course_id: COURSE_ID,
    lesson_id: LESSON_ID,
    post_type: 'discussion_prompt',
    title: `${MARK} old prompt`,
    content: `${MARK} An older question`,
    created_at: '2021-01-01T00:00:00Z',
  })
  const now = Date.now()
  const { error } = await admin()
    .from('community_posts')
    .insert(
      Array.from({ length: 25 }, (_, i) => ({
        tenant_id: CODE_ACADEMY_TENANT,
        author_id: ALICE_ID,
        course_id: COURSE_ID,
        content: `${MARK} filler #${String(i).padStart(2, '0')}`,
        created_at: new Date(now - i * 1000).toISOString(),
      }))
    )
  expect(error).toBeNull()

  await loginAsTenantStudent(page)
  await page.goto(`${COURSE_FEED}?post=${oldPrompt}`)
  const card = page.locator(`#post-${oldPrompt}`)
  await expect(card).toBeFocused({ timeout: 20_000 })
  await expect(page.locator('[data-tour="community-feed"] > [id^="post-"]').first()).toHaveAttribute(
    'id',
    `post-${oldPrompt}`
  )
  // Its comments are open (the composer is the thread's first child).
  await expect(card.getByRole('textbox', { name: 'Write a reply...' })).toBeVisible()

  const end = page.getByText("You've reached the end")
  for (let i = 0; i < 40 && !(await end.isVisible()); i++) {
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(500)
  }
  await expect(end).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(`[id="post-${oldPrompt}"]`)).toHaveCount(1)
})

test('an in-app link to another comment on the focused post moves the highlight', async ({ page }) => {
  test.setTimeout(120_000)
  const postId = await insertPost({ course_id: COURSE_ID, content: `${MARK} two comments` })
  const first = await insertComment(postId, `${MARK} first comment`)
  const second = await insertComment(postId, `${MARK} second comment`)

  await loginAsTenantStudent(page)
  await page.goto(`${COURSE_FEED}?post=${postId}#comment-${first}`)
  await expect(page.locator(`#comment-${first}`)).toHaveAttribute('data-focused', '', { timeout: 20_000 })

  // A client-side navigation, as a notification link makes it (#870). Next
  // moves the URL with pushState, which fires no hashchange. window.next.router
  // is Next's debugging handle on the same router a <Link> uses.
  await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true))
  await page.evaluate(
    (href) => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(href),
    `${new URL(COURSE_FEED).pathname}?post=${postId}#comment-${second}`
  )
  await expect(page.locator(`#comment-${second}`)).toHaveAttribute('data-focused', '', { timeout: 10_000 })
  await expect(page.locator(`#comment-${second}`)).toBeFocused()
  await expect(page.locator(`#comment-${first}`)).not.toHaveAttribute('data-focused', '')
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true)
})

test('?post= focuses the post on all five feeds and refuses posts from elsewhere', async ({ browser }) => {
  test.setTimeout(240_000)
  const schoolPost = await insertPost({ course_id: null, content: `${MARK} school news` })
  const coursePost = await insertPost({ course_id: COURSE_ID, content: `${MARK} course 2001 news` })
  const otherCourseText = `${MARK} course 2002 secret`
  const otherCoursePost = await insertPost({ course_id: OTHER_COURSE_ID, content: otherCourseText })

  const expectFocused = async (page: Page, url: string, postId: string) => {
    await page.goto(`${url}?post=${postId}`)
    const card = page.locator(`#post-${postId}`)
    await expect(card).toHaveAttribute('data-focused', '', { timeout: 20_000 })
    await expect(card).toBeFocused()
    await expect(page.getByText(UNAVAILABLE)).toHaveCount(0)
  }

  const student = await newPage(browser, loginAsTenantStudent)
  await expectFocused(student, FEEDS.studentSchool, schoolPost)
  await expectFocused(student, FEEDS.studentCourse, coursePost)

  // Another course's post, on this course's feed: a notice, and not one word of it.
  await student.goto(`${FEEDS.studentCourse}?post=${otherCoursePost}`)
  await expect(student.getByText(UNAVAILABLE)).toBeVisible({ timeout: 20_000 })
  await expect(student.getByText(otherCourseText)).toHaveCount(0)
  // A school post is not in a course feed either.
  await student.goto(`${FEEDS.studentCourse}?post=${schoolPost}`)
  await expect(student.getByText(UNAVAILABLE)).toBeVisible({ timeout: 20_000 })
  // An id that does not exist.
  await student.goto(`${FEEDS.studentSchool}?post=00000000-0000-4000-8000-000000000000`)
  await expect(student.getByText(UNAVAILABLE)).toBeVisible({ timeout: 20_000 })
  // A malformed id is ignored — no notice, the feed as usual.
  await student.goto(`${FEEDS.studentSchool}?post=not-a-uuid`)
  await expect(student.locator('[data-tour="community-filters"]')).toBeVisible({ timeout: 20_000 })
  await expect(student.getByText(UNAVAILABLE)).toHaveCount(0)

  const staff = await newPage(browser, loginAsAdmin)
  await expectFocused(staff, FEEDS.teacherSchool, schoolPost)
  await expectFocused(staff, FEEDS.teacherCourse, coursePost)
  await expectFocused(staff, FEEDS.adminSchool, schoolPost)
})

test('a locked prompt can be read but not answered, on the lesson and in the feed', async ({ page }) => {
  test.setTimeout(150_000)
  const title = `${MARK} locked prompt`
  const promptId = await insertPost({
    course_id: COURSE_ID,
    lesson_id: LOCKED_LESSON_ID,
    post_type: 'discussion_prompt',
    title,
    content: `${MARK} Closed question`,
  })
  const answer = `${MARK} an answer from before the lock`
  await insertComment(promptId, answer)
  await admin().from('community_posts').update({ is_locked: true }).eq('id', promptId)

  await loginAsTenantStudent(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/lessons/${LOCKED_LESSON_ID}`)
  const article = promptArticle(page, title)
  await expect(article).toBeVisible({ timeout: 30_000 })
  await expect(article).toContainText('Answers are closed')
  await expect(article).toContainText('1 answer')

  await press(article.getByRole('button', { name: 'Read answers' }))
  await expect(article.getByText(answer)).toBeVisible({ timeout: 20_000 })
  await expect(article.getByText('This post is locked. No new comments can be added.')).toBeVisible()
  await expect(article.getByRole('textbox')).toHaveCount(0)

  await page.goto(`${COURSE_FEED}?post=${promptId}`)
  const card = page.locator(`#post-${promptId}`)
  await expect(card.getByText(answer)).toBeVisible({ timeout: 20_000 })
  await expect(card.getByText('This post is locked. No new comments can be added.')).toBeVisible()
  await expect(card.getByRole('textbox')).toHaveCount(0)
})

test('hidden prompts and blocked authors stay out of the lesson, like the feed', async ({ page }) => {
  test.setTimeout(150_000)
  const hiddenTitle = `${MARK} removed prompt`
  await insertPost({
    course_id: COURSE_ID,
    lesson_id: LESSON_ID,
    post_type: 'discussion_prompt',
    title: hiddenTitle,
    content: `${MARK} Removed by a moderator`,
    is_hidden: true,
  })
  // A control by someone alice will not block, so the section still renders
  // and the absences below are real ones (Code Academy has only two members).
  const controlTitle = `${MARK} control prompt`
  await insertPost({
    course_id: COURSE_ID,
    lesson_id: LESSON_ID,
    post_type: 'discussion_prompt',
    title: controlTitle,
    content: `${MARK} Visibility control`,
    author_id: ALICE_ID,
  })

  await loginAsTenantStudent(page)
  await page.goto(LESSON)
  await expect(promptArticle(page, controlTitle)).toBeVisible({ timeout: 30_000 })
  await expect(promptArticle(page, BASE_PROMPT)).toBeVisible()
  await expect(page.getByText(hiddenTitle)).toHaveCount(0)
  await page.goto(COURSE_FEED)
  await expect(page.locator('[data-tour="community-filters"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(hiddenTitle)).toHaveCount(0)

  // alice blocks the teacher: the teacher's prompts leave the lesson and the feed.
  const { error } = await admin().from('community_user_blocks').insert({ blocker_id: ALICE_ID, blocked_id: CREATOR_ID })
  expect(error).toBeNull()
  try {
    await page.goto(LESSON)
    await expect(promptArticle(page, controlTitle)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(BASE_PROMPT)).toHaveCount(0)
    await page.goto(`${COURSE_FEED}?post=${basePromptId}`)
    await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(BASE_PROMPT)).toHaveCount(0)
  } finally {
    await unblock()
  }
})

test('a student entitled by subscription, never enrolled, sees the lesson’s prompts', async ({ page }) => {
  test.setTimeout(120_000)
  const title = `${MARK} pandas prompt`
  await insertPost({
    course_id: OTHER_COURSE_ID,
    lesson_id: OTHER_LESSON_ID,
    post_type: 'discussion_prompt',
    title,
    content: `${MARK} What is a DataFrame to you?`,
  })

  await loginAsTenantStudent(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${OTHER_COURSE_ID}/lessons/${OTHER_LESSON_ID}`)
  await expect(promptArticle(page, title)).toBeVisible({ timeout: 30_000 })
})

test('on a phone the discussion is reachable without sideways overflow', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await loginAsTenantStudent(page)
  await page.goto(LESSON)

  const section = discussion(page)
  const heading = section.getByRole('heading', { name: 'Discussion' })
  await expect(heading).toBeAttached({ timeout: 30_000 })
  await heading.scrollIntoViewIfNeeded()
  await expect(heading).toBeVisible()

  const answerButton = promptArticle(page, BASE_PROMPT).getByRole('button', { name: 'Answer', exact: true })
  await answerButton.scrollIntoViewIfNeeded()
  await expect(answerButton).toBeInViewport()
  await press(answerButton)
  await expect(promptArticle(page, BASE_PROMPT).getByRole('textbox', { name: 'Your answer' })).toBeVisible({
    timeout: 10_000,
  })

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true
  )
  // The lesson scroller clips sideways overflow, so check the section's own edge.
  const right = await section.evaluate((el) => el.getBoundingClientRect().right)
  expect(right).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
})

test('the discussion speaks Spanish', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsTenantStudent(page)
  await page.goto(`${TENANT_BASE}/es/dashboard/student/courses/${COURSE_ID}/lessons/${LESSON_ID}`)
  const section = discussion(page, 'Discusión')
  await expect(section.getByRole('heading', { name: 'Discusión' })).toBeVisible({ timeout: 30_000 })
  await expect(
    promptArticle(page, BASE_PROMPT, 'Discusión').getByRole('button', { name: 'Responder', exact: true })
  ).toBeVisible()
})
