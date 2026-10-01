/**
 * Live community feed + @mentions — issue #876.
 *
 *   isolation  at the Realtime protocol level (supabase-js in Node, each client
 *              with its own session): Alice's course post and a comment on it
 *              reach an enrolled member of the course, and never a Code Academy
 *              student without access to the course nor a Default School
 *              student — whatever filter they subscribe with. A hidden post
 *              reaches nobody.
 *   live feed  two browsers: B posts, Alice sees "1 new post" without a reload
 *              and brings it in; B comments, it appears in Alice's open thread
 *   mentions   Alice types "@", the list offers only members who can see the
 *              course feed; the picked mention renders highlighted and B gets
 *              a community_mention notification that opens the post
 *   channels   moving course feed → school feed → course feed leaves exactly
 *              one feed channel joined (every join has its leave)
 *
 * Who counts as mentioned / notified, retraction and the autocomplete RPC are
 * pinned in SQL (tests/sql/issue-876-community-mentions.sql).
 *
 * Runs on Code Academy (community enabled), desktop only: it writes shared
 * rows. B and D are throwaway students created here with Code Academy as their
 * JWT tenant; every post carries MARK and is removed afterwards.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  createClient as createSupabaseClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { login, loginAsTenantStudent } from './utils/auth'
import { ACCOUNTS, LOCALE, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const COURSE_ID = 2001 // Python for Beginners — Alice is enrolled (seed)

const RUN = Date.now()
const MARK = `[E2E] 876 ${RUN}`
const PASSWORD = 'password123'
const B_EMAIL = `qa-876-b-${RUN}@e2etest.com`
const B_NAME = 'QA Live Member 876'
const D_EMAIL = `qa-876-d-${RUN}@e2etest.com`
const D_NAME = 'QA NoAccess 876'

const COURSE_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${COURSE_ID}/community`
const SCHOOL_FEED = `${TENANT_BASE}/${LOCALE}/dashboard/student/community`

const RUNS_IN = ['desktop-chromium', 'human']

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
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  await client.realtime.setAuth(data.session!.access_token)
  return client
}

interface Listener {
  channel: RealtimeChannel
  rows: Array<Record<string, unknown>>
}

/** Subscribe `client` to INSERTs on `table` with `filter`; resolves once joined. */
async function listen(client: SupabaseClient, table: string, filter: string, name: string): Promise<Listener> {
  const rows: Array<Record<string, unknown>> = []
  const channel = client
    .channel(`e2e-876-${name}-${RUN}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (payload) => {
      rows.push(payload.new as Record<string, unknown>)
    })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: never subscribed`)), 20_000)
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(new Error(`${name}: ${status} ${err?.message ?? ''}`))
      }
    })
  })
  return { channel, rows }
}

async function createStudent(email: string, name: string, withCourseAccess: boolean): Promise<string> {
  const db = admin()
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { tenant_id: CODE_ACADEMY },
  })
  expect(error).toBeNull()
  const id = created.user!.id
  await db.from('profiles').update({ full_name: name }).eq('id', id)
  const membership = await db
    .from('tenant_users')
    .upsert({ tenant_id: CODE_ACADEMY, user_id: id, role: 'student', status: 'active' }, { onConflict: 'tenant_id,user_id' })
  expect(membership.error).toBeNull()
  if (withCourseAccess) {
    expect(
      (await db.from('entitlements').insert({ user_id: id, course_id: COURSE_ID, tenant_id: CODE_ACADEMY, source_type: 'admin_grant' }))
        .error
    ).toBeNull()
    expect(
      (await db.from('enrollments').insert({ user_id: id, course_id: COURSE_ID, tenant_id: CODE_ACADEMY, status: 'active' })).error
    ).toBeNull()
  }
  return id
}

async function removeMarkedPosts() {
  const db = admin()
  const { data } = await db.from('community_posts').select('id').like('content', '[E2E] 876%').limit(1000)
  const ids = (data ?? []).map((p) => p.id as string)
  if (ids.length) await db.from('community_posts').delete().in('id', ids)
}

async function composerBox(page: Page) {
  const box = page.locator('[data-tour="community-composer"]')
  await expect(box).toBeVisible({ timeout: 30_000 })
  return box
}

async function newPage(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, email, password, TENANT_BASE)
  return page
}

/**
 * The Realtime topics a page has joined and not left, read off its websocket
 * frames. A socket that closed (a full page load) takes its topics with it.
 */
function trackRealtimeTopics(page: Page) {
  const joined: string[] = []
  const left: string[] = []
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/realtime/')) return
    const mine: string[] = []
    ws.on('close', () => {
      for (const t of mine) left.push(t)
    })
    ws.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return
      let topic: unknown
      let event: unknown
      try {
        const msg = JSON.parse(payload)
        // Protocol 1.0 sends objects, 2.0 sends [join_ref, ref, topic, event, payload].
        ;[topic, event] = Array.isArray(msg) ? [msg[2], msg[3]] : [msg.topic, msg.event]
      } catch {
        return
      }
      if (typeof topic !== 'string' || !topic.startsWith('realtime:community_')) return
      if (event === 'phx_join') {
        joined.push(topic)
        mine.push(topic)
      }
      if (event === 'phx_leave') {
        left.push(topic)
        mine.splice(mine.indexOf(topic), 1)
      }
    })
  })
  const open = (prefix: string) => {
    const counts = new Map<string, number>()
    for (const t of joined) counts.set(t, (counts.get(t) ?? 0) + 1)
    for (const t of left) counts.set(t, (counts.get(t) ?? 0) - 1)
    return [...counts.entries()].filter(([t, n]) => t.startsWith(prefix) && n > 0).map(([t]) => t)
  }
  return { joined, left, open }
}

let bId = ''
let dId = ''

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
  test.skip(!RUNS_IN.includes(testInfo.project.name), 'runs once — DB state is shared')
})

test.beforeAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  await removeMarkedPosts()
  bId = await createStudent(B_EMAIL, B_NAME, true)
  dId = await createStudent(D_EMAIL, D_NAME, false)
  // Nobody here blocks anybody, and mentions are on.
  const db = admin()
  await db.from('community_user_blocks').delete().or(`blocker_id.eq.${ALICE_ID},blocked_id.eq.${ALICE_ID}`)
})

test.afterAll(async ({}, testInfo) => {
  if (!RUNS_IN.includes(testInfo.project.name)) return
  await removeMarkedPosts()
  const db = admin()
  // Cascades memberships, entitlements, enrollments, profiles, mentions.
  if (bId) await db.auth.admin.deleteUser(bId)
  if (dId) await db.auth.admin.deleteUser(dId)
})

test('Realtime only delivers a course post and its comments to members who can read them', async () => {
  test.setTimeout(120_000)
  const member = await signIn(B_EMAIL, PASSWORD)
  const noAccess = await signIn(D_EMAIL, PASSWORD)
  const otherSchool = await signIn(ACCOUNTS.student.email, ACCOUNTS.student.password) // Default School only

  const listeners = {
    memberCourse: await listen(member, 'community_posts', `course_id=eq.${COURSE_ID}`, 'member-course'),
    memberSchool: await listen(member, 'community_posts', `tenant_id=eq.${CODE_ACADEMY}`, 'member-school'),
    noAccessCourse: await listen(noAccess, 'community_posts', `course_id=eq.${COURSE_ID}`, 'noaccess-course'),
    noAccessSchool: await listen(noAccess, 'community_posts', `tenant_id=eq.${CODE_ACADEMY}`, 'noaccess-school'),
    otherCourse: await listen(otherSchool, 'community_posts', `course_id=eq.${COURSE_ID}`, 'other-course'),
    otherSchool: await listen(otherSchool, 'community_posts', `tenant_id=eq.${CODE_ACADEMY}`, 'other-school'),
  }

  const db = admin()
  const hidden = await db
    .from('community_posts')
    .insert({ tenant_id: CODE_ACADEMY, author_id: ALICE_ID, course_id: COURSE_ID, content: `${MARK} hidden`, is_hidden: true })
    .select('id')
    .single()
  expect(hidden.error).toBeNull()
  const { data: post, error } = await db
    .from('community_posts')
    .insert({ tenant_id: CODE_ACADEMY, author_id: ALICE_ID, course_id: COURSE_ID, content: `${MARK} realtime isolation` })
    .select('id')
    .single()
  expect(error).toBeNull()
  const postId = post!.id as string

  await expect.poll(() => listeners.memberCourse.rows.map((r) => r.id), { timeout: 20_000 }).toContain(postId)
  await expect.poll(() => listeners.memberSchool.rows.map((r) => r.id), { timeout: 20_000 }).toContain(postId)

  // Comments on it, per thread.
  const memberThread = await listen(member, 'community_comments', `post_id=eq.${postId}`, 'member-thread')
  const noAccessThread = await listen(noAccess, 'community_comments', `post_id=eq.${postId}`, 'noaccess-thread')
  const otherThread = await listen(otherSchool, 'community_comments', `post_id=eq.${postId}`, 'other-thread')
  const otherTenantComments = await listen(otherSchool, 'community_comments', `tenant_id=eq.${CODE_ACADEMY}`, 'other-comments')
  const comment = await db
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY, post_id: postId, author_id: ALICE_ID, content: 'live comment' })
    .select('id')
    .single()
  expect(comment.error).toBeNull()
  await expect.poll(() => memberThread.rows.map((r) => r.id), { timeout: 20_000 }).toContain(comment.data!.id)

  // Give anything that would leak the same time again, then check nothing did.
  await new Promise((r) => setTimeout(r, 4_000))
  expect(listeners.noAccessCourse.rows, 'no-access student, course filter').toEqual([])
  expect(listeners.noAccessSchool.rows, 'no-access student, tenant filter').toEqual([])
  expect(listeners.otherCourse.rows, 'another school, course filter').toEqual([])
  expect(listeners.otherSchool.rows, 'another school, tenant filter').toEqual([])
  expect(noAccessThread.rows, 'no-access student, thread').toEqual([])
  expect(otherThread.rows, 'another school, thread').toEqual([])
  expect(otherTenantComments.rows, 'another school, tenant comments').toEqual([])
  // The hidden post reached nobody, the member included.
  expect(listeners.memberCourse.rows.map((r) => r.id)).not.toContain(hidden.data!.id)
  expect(listeners.memberSchool.rows.map((r) => r.id)).not.toContain(hidden.data!.id)

  for (const client of [member, noAccess, otherSchool]) await client.removeAllChannels()
})

test('two browsers: a new post shows as "1 new post" without a reload, and comments arrive live', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)

  await loginAsTenantStudent(page) // Alice
  await page.goto(COURSE_FEED)
  await composerBox(page)
  const topics = trackRealtimeTopics(page)
  // The feed channel is up before B posts.
  await page.reload()
  await composerBox(page)
  await expect.poll(() => topics.open('realtime:community_posts:').length, { timeout: 20_000 }).toBe(1)

  const bPage = await newPage(browser, B_EMAIL, PASSWORD)
  await bPage.goto(COURSE_FEED)
  const bBox = await composerBox(bPage)
  const text = `${MARK} live post`
  await bBox.getByRole('textbox', { name: "What's on your mind?" }).fill(text)
  await bBox.getByRole('button', { name: /^Post/ }).click()

  // Alice: the pill, not the post — nothing moved under her.
  const pill = page.getByTestId('community-new-posts')
  await expect(pill).toHaveText(/1 new post/, { timeout: 30_000 })
  await expect(page.getByText(text)).toHaveCount(0)
  await pill.click()
  const card = page.locator('div.rounded-xl', { hasText: text }).last()
  await expect(card).toBeVisible()
  await expect(pill).toHaveCount(0)

  // Alice opens the comments; B's comment lands without a reload.
  await card.getByRole('button', { name: /^(Show comments|\d+ comments?)$/ }).click()
  await expect(card.getByPlaceholder('Write a reply...').first()).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => topics.open('realtime:community_comments:').length, { timeout: 20_000 }).toBe(1)

  const bCard = bPage.locator('div.rounded-xl', { hasText: text }).last()
  await expect(bCard).toBeVisible({ timeout: 30_000 })
  await bCard.getByRole('button', { name: /^(Show comments|\d+ comments?)$/ }).click()
  const replyBox = bCard.getByPlaceholder('Write a reply...').first()
  await expect(replyBox).toBeVisible({ timeout: 20_000 })
  await replyBox.fill('Comment that arrives live')
  await replyBox.locator('xpath=ancestor::div[contains(@class,"flex-1")][1]/following-sibling::button[1]').click()

  await expect(card.getByText('Comment that arrives live')).toBeVisible({ timeout: 30_000 })
  await bPage.context().close()
})

test('@ autocomplete offers only members who can see the course; the mention is highlighted and notified', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await loginAsTenantStudent(page) // Alice
  await page.goto(COURSE_FEED)
  const box = await composerBox(page)
  const textarea = box.getByRole('textbox', { name: "What's on your mind?" })

  await textarea.click()
  await textarea.pressSequentially(`${MARK} hey @QA`)
  const list = page.getByTestId('mention-candidates')
  await expect(list.getByRole('option', { name: B_NAME })).toBeVisible({ timeout: 20_000 })
  // D is in the school but has no access to this course: never offered here.
  await expect(list.getByRole('option', { name: D_NAME })).toHaveCount(0)

  await textarea.press('Enter')
  await expect(list).toHaveCount(0)
  await expect(textarea).toHaveValue(`${MARK} hey [@${B_NAME}](mention:${bId}) `)
  await textarea.pressSequentially('look at this')
  await box.getByRole('button', { name: /^Post/ }).click()

  let postId = ''
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('community_posts')
          .select('id')
          .eq('author_id', ALICE_ID)
          .like('content', `${MARK} hey%`)
          .limit(1)
        postId = (data?.[0]?.id as string) ?? ''
        return postId
      },
      { timeout: 30_000 }
    )
    .not.toBe('')

  // Highlighted in the feed, as a name — no link, no id in the text.
  const card = page.locator('div.rounded-xl', { hasText: 'look at this' }).last()
  await expect(card.locator('[data-mention]')).toHaveText(`@${B_NAME}`, { timeout: 30_000 })
  await expect(card).not.toContainText('mention:')

  // B is told, with a link to the post.
  const db = admin()
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from('user_notifications')
          .select('notification:notifications!inner(metadata, community_post_id)')
          .eq('user_id', bId)
          .eq('notification.community_post_id', postId)
          .limit(5)
        return (data ?? []).map((r) => (r.notification as unknown as { metadata: { kind: string } }).metadata.kind)
      },
      { timeout: 20_000 }
    )
    .toEqual(['community_mention'])
  const { data: mentions } = await db.from('community_mentions').select('mentioned_user_id').eq('post_id', postId)
  expect(mentions).toEqual([{ mentioned_user_id: bId }])

  // The school feed: D is a member of the school, so there she is offered.
  await page.goto(SCHOOL_FEED)
  const schoolBox = await composerBox(page)
  const schoolText = schoolBox.getByRole('textbox', { name: "What's on your mind?" })
  await schoolText.click()
  await schoolText.pressSequentially('@QA')
  await expect(page.getByTestId('mention-candidates').getByRole('option', { name: D_NAME })).toBeVisible({
    timeout: 20_000,
  })
  await schoolText.press('Escape')
  await expect(page.getByTestId('mention-candidates')).toHaveCount(0)
})

test('navigating between feeds leaves one feed channel, none leaked', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsTenantStudent(page)
  const topics = trackRealtimeTopics(page)
  await page.goto(COURSE_FEED)
  await composerBox(page)
  await expect.poll(() => topics.open('realtime:community_posts:course_id').length, { timeout: 20_000 }).toBe(1)

  // A client-side navigation (the sidebar link) keeps the socket: the course
  // channel must send its leave.
  const sockets: string[] = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  await page.locator('a[href$="/dashboard/student/community"]').first().click()
  await page.waitForURL(/\/dashboard\/student\/community$/)
  await composerBox(page)
  await expect.poll(() => topics.open('realtime:community_posts:tenant_id').length, { timeout: 20_000 }).toBe(1)
  expect(topics.open('realtime:community_posts:course_id')).toEqual([])
  expect(sockets, 'the navigation reused the socket').toEqual([])

  await page.goBack()
  await composerBox(page)
  await expect.poll(() => topics.open('realtime:community_posts:').length, { timeout: 20_000 }).toBe(1)
  expect(topics.open('realtime:community_posts:course_id')).toHaveLength(1)
})
