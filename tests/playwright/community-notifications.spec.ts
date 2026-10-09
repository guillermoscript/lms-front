/**
 * Community notifications — issue #870.
 *
 *   headline   student A posts in the course feed, student B replies in the
 *              UI; A sees the sidebar badge and the bell, the school feed the
 *              badge links to lists the reply, and the bell item opens the
 *              exact post/comment and marks it read
 *   batching   B replies 5 times through RLS (the native app's path): A has
 *              ONE unread notification, "5 new replies"
 *   parent     a third member replies to B's comment on A's post: B hears
 *              about their comment, A about their post
 *   self       A's own comment notifies nobody
 *   prefs      A turns Replies off in the Preferences sheet: nothing arrives
 *   blocks     no notification across a block, in either direction
 *   prompts    a course discussion prompt reaches the enrolled students with
 *              access, and respects the prompts preference and lost access
 *
 * Recipient resolution, batching, the push cooldown and retraction are pinned
 * in SQL (tests/sql/issue-870-community-notifications.sql); this proves the
 * loop end to end on the real app. Scrolling to `?post=` / `#comment-` is
 * #869's — this spec asserts the link only.
 *
 * Runs on Code Academy (community enabled). B is a throwaway student created
 * here with Code Academy as its JWT tenant; every post carries MARK and is
 * removed afterwards (comments and notifications cascade), and Alice's
 * preferences and blocks are put back as they were. Desktop only: it rewrites
 * shared rows, and on mobile the sidebar badge sits in a closed sheet.
 */
import { test, expect, type Browser, type Page } from './utils/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { login, loginAsTenantStudent } from './utils/auth'
import { ACCOUNTS, LOCALE, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const COURSE_ID = 2001 // Python for Beginners — Alice is enrolled (seed)

const RUN = Date.now()
const MARK = `[E2E] 870 ${RUN}`
const B_EMAIL = `qa-870-b-${RUN}@e2etest.com`
const B_PASSWORD = 'password123'
const B_NAME = 'QA Replier 870'

const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const SCHOOL_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/community`
const NOTIFICATIONS_PAGE = `${TENANT_BASE}/${LOCALE}/dashboard/notifications`

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return client
}

let bId = ''
let alicePrefsSnapshot: Record<string, unknown> | null = null
let aliceBlocksSnapshot: Array<{ blocker_id: string; blocked_id: string }> = []

/** A post by Alice in the course feed, written with the service role. */
async function seedAlicePost(label: string): Promise<string> {
  const { data, error } = await admin()
    .from('community_posts')
    .insert({ tenant_id: CODE_ACADEMY, author_id: ALICE_ID, course_id: COURSE_ID, content: `${MARK} ${label}` })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

/** A comment written through RLS, as the native app and MCP write them. */
async function commentAs(client: SupabaseClient, authorId: string, postId: string, content: string) {
  const { data, error } = await client
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY, post_id: postId, author_id: authorId, content })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

interface DeliveryRow {
  id: number
  in_app_read: boolean | null
  dismissed: boolean | null
  notification: { id: number; metadata: Record<string, unknown>; notification_type: string }
}

/** `userId`'s community notifications about `postId`. */
async function deliveries(userId: string, postId: string): Promise<DeliveryRow[]> {
  const { data, error } = await admin()
    .from('user_notifications')
    .select('id, in_app_read, dismissed, notification:notifications!inner(id, metadata, notification_type, community_post_id)')
    .eq('user_id', userId)
    .eq('notification.community_post_id', postId)
    .limit(50)
  expect(error).toBeNull()
  return (data ?? []) as unknown as DeliveryRow[]
}

/** Recipients of the prompt notification for `postId` (one shared row). */
async function promptAudience(postId: string): Promise<string[]> {
  const { data: rows } = await admin()
    .from('notifications')
    .select('id')
    .eq('community_post_id', postId)
    .eq('tenant_id', CODE_ACADEMY)
    .limit(5)
  expect(rows?.length ?? 0).toBeLessThanOrEqual(1)
  if (!rows?.length) return []
  const { data } = await admin().from('user_notifications').select('user_id').eq('notification_id', rows[0].id).limit(1000)
  return (data ?? []).map((r) => r.user_id as string)
}

async function seedPrompt(label: string): Promise<string> {
  const { data, error } = await admin()
    .from('community_posts')
    .insert({
      tenant_id: CODE_ACADEMY,
      author_id: CREATOR_ID,
      course_id: COURSE_ID,
      post_type: 'discussion_prompt',
      title: `${MARK} ${label}`,
      content: `${MARK} ${label}`,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

async function setAlicePrefs(prefs: Record<string, boolean> | null) {
  const db = admin()
  if (prefs === null) {
    await db.from('notification_preferences').delete().eq('user_id', ALICE_ID)
    return
  }
  const { error } = await db.from('notification_preferences').upsert({ user_id: ALICE_ID, ...prefs }, { onConflict: 'user_id' })
  expect(error).toBeNull()
}

/** Mark every unread notification Alice has in Code Academy read, so counts start at 0. */
async function clearAliceUnread() {
  const db = admin()
  const { data } = await db
    .from('user_notifications')
    .select('id, notification:notifications!inner(tenant_id)')
    .eq('user_id', ALICE_ID)
    .eq('in_app_read', false)
    .eq('notification.tenant_id', CODE_ACADEMY)
    .limit(1000)
  const ids = (data ?? []).map((r) => r.id as number)
  if (ids.length) {
    await db.from('user_notifications').update({ in_app_read: true, in_app_read_at: new Date().toISOString() }).in('id', ids)
  }
}

async function removeMarkedPosts() {
  const db = admin()
  const { data } = await db.from('community_posts').select('id').like('content', '[E2E] 870%').limit(1000)
  const ids = (data ?? []).map((p) => p.id as string)
  if (ids.length) await db.from('community_posts').delete().in('id', ids)
}

async function composerBox(page: Page) {
  const box = page.locator('[data-tour="community-composer"]')
  await expect(box).toBeVisible({ timeout: 30_000 })
  return box
}

async function newStudentPage(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, email, password, TENANT_BASE)
  return page
}

/** Projects this spec runs in: it rewrites shared rows (Alice's preferences and blocks). */
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
  const enrollment = await db
    .from('enrollments')
    .insert({ user_id: bId, course_id: COURSE_ID, tenant_id: CODE_ACADEMY, status: 'active' })
  expect(enrollment.error).toBeNull()

  const { data: prefs } = await db.from('notification_preferences').select('*').eq('user_id', ALICE_ID).maybeSingle()
  alicePrefsSnapshot = prefs
  const { data: blocks } = await db
    .from('community_user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${ALICE_ID},blocked_id.eq.${ALICE_ID}`)
    .limit(100)
  aliceBlocksSnapshot = blocks ?? []

  await setAlicePrefs(null)
  if (aliceBlocksSnapshot.length) {
    await db.from('community_user_blocks').delete().or(`blocker_id.eq.${ALICE_ID},blocked_id.eq.${ALICE_ID}`)
  }
  await clearAliceUnread()
})

test.afterAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  const db = admin()
  await removeMarkedPosts()

  await db.from('notification_preferences').delete().eq('user_id', ALICE_ID)
  if (alicePrefsSnapshot) {
    const row = { ...alicePrefsSnapshot }
    delete row.id
    await db.from('notification_preferences').insert(row)
  }
  await db.from('community_user_blocks').delete().or(`blocker_id.eq.${ALICE_ID},blocked_id.eq.${ALICE_ID}`)
  if (aliceBlocksSnapshot.length) await db.from('community_user_blocks').insert(aliceBlocksSnapshot)

  // Cascades B's membership, entitlement, enrollment, profile and blocks.
  if (bId) await db.auth.admin.deleteUser(bId)
})

test('B replies to A\'s post; A sees the badge and the bell, and the item opens the exact comment', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)

  // A posts from the course feed composer.
  await loginAsTenantStudent(page)
  await page.goto(COURSE_FEED)
  const box = await composerBox(page)
  const text = `${MARK} headline`
  await box.getByRole('textbox', { name: "What's on your mind?" }).fill(text)
  await box.getByRole('button', { name: /^Post/ }).click()

  let postId = ''
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_posts')
          .select('id')
          .eq('tenant_id', CODE_ACADEMY)
          .eq('author_id', ALICE_ID)
          .eq('content', text)
          .limit(1)
        postId = (data?.[0]?.id as string) ?? ''
        return postId
      },
      { timeout: 30_000 }
    )
    .not.toBe('')

  // B replies in the UI, in a second browser context.
  const bPage = await newStudentPage(browser, B_EMAIL, B_PASSWORD)
  await bPage.goto(COURSE_FEED)
  const card = bPage.locator('div.rounded-xl', { hasText: text }).last()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole('button', { name: /^(Show comments|\d+ comments?)$/ }).click()
  const replyBox = card.getByPlaceholder('Write a reply...').first()
  await expect(replyBox).toBeVisible({ timeout: 20_000 })
  await replyBox.fill('Try a while loop instead')
  // The send button sits after the markdown field (#872) that wraps the box.
  await replyBox.locator('xpath=ancestor::div[contains(@class,"flex-1")][1]/following-sibling::button[1]').click()

  let commentId = ''
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_comments')
          .select('id')
          .eq('post_id', postId)
          .eq('author_id', bId)
          .limit(1)
        commentId = (data?.[0]?.id as string) ?? ''
        return commentId
      },
      { timeout: 30_000 }
    )
    .not.toBe('')
  await bPage.context().close()

  // One unread notification for A, pointing at the comment.
  await expect.poll(async () => (await deliveries(ALICE_ID, postId)).length, { timeout: 15_000 }).toBe(1)
  const [delivery] = await deliveries(ALICE_ID, postId)
  expect(delivery.notification.metadata).toMatchObject({
    kind: 'community_reply',
    reply_to: 'post',
    count: 1,
    comment_id: commentId,
    actor_name: B_NAME,
  })

  // A sees it: sidebar badge + bell count.
  await page.reload()
  await expect(page.getByTestId('sidebar-community-badge')).toHaveText('1', { timeout: 30_000 })
  await expect(page.getByTestId('notification-bell-count')).toHaveText('1')

  // The badge links to the school feed, where a course-feed reply never shows:
  // the unread list above the feed does.
  await page.goto(SCHOOL_FEED)
  await expect(
    page
      .getByTestId('community-unread')
      .getByTestId('notification-link')
      .filter({ hasText: `${B_NAME} replied to your post` })
  ).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('notification-bell').click()
  const item = page
    .getByTestId('notification-popover')
    .getByTestId('notification-link')
    .filter({ hasText: `${B_NAME} replied to your post` })
  await expect(item).toBeVisible({ timeout: 20_000 })
  const href = await item.getAttribute('href')
  expect(href).toMatch(
    new RegExp(`^(/(en|es))?/dashboard/student/courses/${COURSE_ID}/community\\?post=${postId}#comment-${commentId}$`)
  )

  // Opening it lands on the post and marks it read; the badges clear.
  await item.click()
  await page.waitForURL(
    (url) => url.pathname.endsWith(`/dashboard/student/courses/${COURSE_ID}/community`) && url.search.includes(`post=${postId}`),
    { timeout: 30_000 }
  )
  await expect.poll(async () => (await deliveries(ALICE_ID, postId))[0]?.in_app_read, { timeout: 15_000 }).toBe(true)
  await expect(page.getByTestId('sidebar-community-badge')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByTestId('notification-bell-count')).toHaveCount(0)
})

test('five replies through RLS collapse into one notification', async ({ page }) => {
  test.setTimeout(120_000)
  const postId = await seedAlicePost('batch')
  const b = await signIn(B_EMAIL, B_PASSWORD)
  for (let i = 1; i <= 5; i++) await commentAs(b, bId, postId, `reply ${i}`)

  const rows = await deliveries(ALICE_ID, postId)
  expect(rows).toHaveLength(1)
  expect(rows[0].in_app_read).toBe(false)
  expect(rows[0].notification.metadata).toMatchObject({ kind: 'community_reply', count: 5, snippet: 'reply 5' })

  await loginAsTenantStudent(page)
  await page.goto(NOTIFICATIONS_PAGE)
  const list = page.getByTestId('notifications-list')
  await expect(list.getByTestId('notification-item').filter({ hasText: '5 new replies' })).toBeVisible({ timeout: 30_000 })
})

test('a reply to B\'s comment on A\'s post tells B about the comment and A about the post', async () => {
  const postId = await seedAlicePost('parent')
  const b = await signIn(B_EMAIL, B_PASSWORD)
  const bComment = await commentAs(b, bId, postId, 'first thought')

  // A third member — the school's admin — replies to B's comment.
  const { data, error } = await admin()
    .from('community_comments')
    .insert({
      tenant_id: CODE_ACADEMY,
      post_id: postId,
      author_id: CREATOR_ID,
      parent_comment_id: bComment,
      content: 'Good point',
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  const replyId = data!.id as string

  const toB = await deliveries(bId, postId)
  expect(toB).toHaveLength(1)
  expect(toB[0].notification.metadata).toMatchObject({
    kind: 'community_reply',
    reply_to: 'comment',
    count: 1,
    comment_id: replyId,
  })
  const toA = await deliveries(ALICE_ID, postId)
  expect(toA).toHaveLength(1)
  expect(toA[0].notification.metadata).toMatchObject({
    kind: 'community_reply',
    reply_to: 'post',
    count: 2,
    comment_id: replyId,
  })
  expect(await deliveries(CREATOR_ID, postId)).toEqual([])
})

test('your own comment notifies nobody', async () => {
  const postId = await seedAlicePost('self')
  const alice = await signIn(ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password)
  await commentAs(alice, ALICE_ID, postId, 'talking to myself')
  expect(await deliveries(ALICE_ID, postId)).toEqual([])
})

test('turning Replies off in Preferences stops reply notifications', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsTenantStudent(page)
  await page.goto(NOTIFICATIONS_PAGE)
  await page.getByTestId('notification-preferences-open').click()
  const sheet = page.getByTestId('notification-preferences')
  await expect(sheet).toBeVisible({ timeout: 20_000 })
  const replies = sheet.getByRole('switch', { name: 'Replies' })
  await expect(replies).toHaveAttribute('aria-checked', 'true')

  await replies.click()
  await expect(replies).toHaveAttribute('aria-checked', 'false')
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('notification_preferences')
          .select('community_replies')
          .eq('user_id', ALICE_ID)
          .maybeSingle()
        return data?.community_replies
      },
      { timeout: 15_000 }
    )
    .toBe(false)

  const postId = await seedAlicePost('prefs')
  const b = await signIn(B_EMAIL, B_PASSWORD)
  await commentAs(b, bId, postId, 'you will not hear about this')
  expect(await deliveries(ALICE_ID, postId)).toEqual([])

  // And back on.
  await expect(replies).toBeEnabled()
  await replies.click()
  await expect(replies).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('notification_preferences')
          .select('community_replies')
          .eq('user_id', ALICE_ID)
          .maybeSingle()
        return data?.community_replies
      },
      { timeout: 15_000 }
    )
    .toBe(true)
})

test('no notification across a block, in either direction', async () => {
  const postId = await seedAlicePost('blocks')
  const alice = await signIn(ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password)
  const b = await signIn(B_EMAIL, B_PASSWORD)

  expect((await alice.from('community_user_blocks').insert({ blocker_id: ALICE_ID, blocked_id: bId })).error).toBeNull()
  await commentAs(b, bId, postId, 'blocked by alice')
  expect(await deliveries(ALICE_ID, postId)).toEqual([])
  expect((await alice.from('community_user_blocks').delete().eq('blocker_id', ALICE_ID).eq('blocked_id', bId)).error).toBeNull()

  expect((await b.from('community_user_blocks').insert({ blocker_id: bId, blocked_id: ALICE_ID })).error).toBeNull()
  // RLS hides Alice's post (and its comments) from B now (#846), so the insert
  // cannot read its own row back — `commentAs`'s `.select()` would 42501. Write
  // it without the read-back.
  const { error: insertError } = await b
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY, post_id: postId, author_id: bId, content: 'i blocked alice' })
  expect(insertError).toBeNull()
  expect(await deliveries(ALICE_ID, postId)).toEqual([])
  expect((await b.from('community_user_blocks').delete().eq('blocker_id', bId).eq('blocked_id', ALICE_ID)).error).toBeNull()
})

test('a course discussion prompt reaches its students, respecting preferences and access', async () => {
  // Everyone enrolled with access, through one shared row.
  const first = await seedPrompt('prompt 1')
  const firstAudience = await promptAudience(first)
  expect(firstAudience).toEqual(expect.arrayContaining([ALICE_ID, bId]))
  expect(firstAudience).not.toContain(CREATOR_ID)

  // Alice turned prompts off.
  await setAlicePrefs({ community_prompts: false })
  const second = await seedPrompt('prompt 2')
  const secondAudience = await promptAudience(second)
  expect(secondAudience).toContain(bId)
  expect(secondAudience).not.toContain(ALICE_ID)
  await setAlicePrefs(null)

  // B lost access to the course.
  const revoke = await admin()
    .from('entitlements')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('user_id', bId)
    .eq('course_id', COURSE_ID)
  expect(revoke.error).toBeNull()
  const third = await seedPrompt('prompt 3')
  const thirdAudience = await promptAudience(third)
  expect(thirdAudience).toContain(ALICE_ID)
  expect(thirdAudience).not.toContain(bId)
})
