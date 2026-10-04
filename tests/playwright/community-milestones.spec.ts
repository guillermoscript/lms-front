/**
 * Automatic milestone posts — issue #871.
 *
 * The database writes a milestone post when a student completes a course,
 * earns a certificate, reaches level 5+ or a 7/30/100-day streak
 * (migration 20260928120000). These drive it the way it happens for real:
 *
 *   1  Alice completes the LAST lesson in the lesson player → exactly one
 *      "Completed <course>" card in the course feed; she can like and comment
 *   2  through RLS: reactions and comments on a milestone work; nobody —
 *      staff included — can insert a milestone post
 *   3  uncompleting and completing again does not post twice
 *   4  the admin turns "Share student milestones" off → nothing is posted
 *   5  Alice turns "Share my milestones" off on her profile → nothing is posted
 *   6  level 5 and a 7-day streak show in the school feed with real values
 *
 * Self-contained on Code Academy: a `[E2E] 871` course with two lessons and
 * an admin_grant entitlement for Alice, created in beforeAll and removed in
 * afterAll, which also restores Alice's gamification profile, her
 * share_milestones preference and the school's milestone switch.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'
import { ALICE_ID, CODE_ACADEMY_TENANT, getServiceRoleClient } from './utils/seed-state'

const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const MARK = '[E2E] 871'
const RUN = Date.now()
const COURSE_TITLE = `${MARK} Milestone course ${RUN}`
const SETTING_KEY = 'community_milestone_posts'

let courseId: number
let lessonIds: number[] = []

type GamificationSnapshot = {
  total_xp: number | null
  level: number | null
  current_streak: number | null
  longest_streak: number | null
  last_activity_date: string | null
  streak_freezes_available: number | null
}
let gamification: GamificationSnapshot | null = null
let shareMilestones = true
let settingRow: { setting_value: unknown } | null = null

const admin = () => getServiceRoleClient()

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data as NonNullable<T>
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

/** base-ui controls intermittently swallow Playwright's pointer sequence. */
async function domClick(locator: ReturnType<Page['locator']>) {
  await locator.first().waitFor({ state: 'visible', timeout: 30_000 })
  await locator.first().evaluate((el) => (el as HTMLElement).click())
}

/** Alice's milestone posts about the fixture course. */
async function courseMilestones() {
  const { data, error } = await admin()
    .from('community_posts')
    .select('id, milestone_type, milestone_data, reaction_count, comment_count')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('author_id', ALICE_ID)
    .eq('post_type', 'milestone')
    .eq('course_id', courseId)
  expect(error).toBeNull()
  return data ?? []
}

/** Written with the service role — the same path the triggers see from the app. */
async function completeLesson(lessonId: number) {
  const { error } = await admin().from('lesson_completions').insert({ user_id: ALICE_ID, lesson_id: lessonId })
  expect(error).toBeNull()
}

/** Back to "no progress, nothing announced" for the fixture course. */
async function resetCourse() {
  await admin().from('community_posts').delete().eq('tenant_id', CODE_ACADEMY_TENANT).eq('course_id', courseId).eq('post_type', 'milestone')
  await admin().from('lesson_completions').delete().eq('user_id', ALICE_ID).in('lesson_id', lessonIds)
}

async function deleteAliceSchoolMilestones() {
  await admin()
    .from('community_posts')
    .delete()
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('author_id', ALICE_ID)
    .eq('post_type', 'milestone')
    .is('course_id', null)
}

async function removeFixtures(db: SupabaseClient) {
  const { data: courses } = await db
    .from('courses')
    .select('course_id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .like('title', `${MARK}%`)
  for (const { course_id } of courses ?? []) {
    const { data: lessons } = await db.from('lessons').select('id').eq('course_id', course_id)
    const ids = (lessons ?? []).map((l) => l.id)
    // Cascades to comments and reactions.
    await db.from('community_posts').delete().eq('course_id', course_id)
    if (ids.length) {
      await db.from('lesson_completions').delete().in('lesson_id', ids)
      await db
        .from('gamification_xp_transactions')
        .delete()
        .eq('user_id', ALICE_ID)
        .eq('action_type', 'lesson_completion')
        .in('reference_id', ids.map(String))
    }
    // Cascades to lessons and the entitlement.
    await db.from('courses').delete().eq('course_id', course_id)
  }
  await db.from('community_posts').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('content', `${MARK}%`)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const db = admin()
  await removeFixtures(db)

  gamification = must(
    await db
      .from('gamification_profiles')
      .select('total_xp, level, current_streak, longest_streak, last_activity_date, streak_freezes_available')
      .eq('user_id', ALICE_ID)
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .single(),
    'snapshot gamification'
  )
  const profile = must(await db.from('profiles').select('share_milestones').eq('id', ALICE_ID).single(), 'snapshot profile')
  shareMilestones = profile.share_milestones
  const { data: setting } = await db
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('setting_key', SETTING_KEY)
    .maybeSingle()
  settingRow = setting

  // Start from the defaults: the school shares, Alice shares, nothing posted.
  await db.from('tenant_settings').delete().eq('tenant_id', CODE_ACADEMY_TENANT).eq('setting_key', SETTING_KEY)
  await db.from('profiles').update({ share_milestones: true }).eq('id', ALICE_ID)
  await db.from('community_posts').delete().eq('tenant_id', CODE_ACADEMY_TENANT).eq('author_id', ALICE_ID).eq('post_type', 'milestone')

  const course = must(
    await db
      .from('courses')
      .insert({
        title: COURSE_TITLE,
        description: 'Seeded by community-milestones.spec.ts. Safe to delete.',
        status: 'published',
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('course_id')
      .single(),
    'seed course'
  )
  courseId = course.course_id

  const lessons = must(
    await db
      .from('lessons')
      .insert(
        [1, 2].map((n) => ({
          course_id: courseId,
          title: `${MARK} Lesson ${n}`,
          description: `Lesson ${n}.`,
          content: `# Lesson ${n}\n\nRead this and mark it complete.`,
          sequence: n,
          status: 'published',
          tenant_id: CODE_ACADEMY_TENANT,
        }))
      )
      .select('id, sequence'),
    'seed lessons'
  )
  lessonIds = [...lessons].sort((a, b) => a.sequence - b.sequence).map((l) => l.id)

  must(
    await db
      .from('entitlements')
      .insert({ user_id: ALICE_ID, course_id: courseId, tenant_id: CODE_ACADEMY_TENANT, source_type: 'admin_grant' })
      .select('entitlement_id')
      .single(),
    'seed entitlement'
  )

  // Half the course: nothing to announce yet.
  await completeLesson(lessonIds[0])
  expect(await courseMilestones()).toHaveLength(0)
})

test.afterAll(async () => {
  const db = admin()
  await removeFixtures(db)
  // Restoring the snapshot can itself cross a level or streak threshold (test
  // 6 leaves Alice at level 5 / 7 days) and write a post: restore first, then
  // clear her school milestones.
  if (gamification) {
    await db.from('gamification_profiles').update(gamification).eq('user_id', ALICE_ID).eq('tenant_id', CODE_ACADEMY_TENANT)
  }
  await db.from('profiles').update({ share_milestones: shareMilestones }).eq('id', ALICE_ID)
  await db.from('tenant_settings').delete().eq('tenant_id', CODE_ACADEMY_TENANT).eq('setting_key', SETTING_KEY)
  if (settingRow) {
    await db
      .from('tenant_settings')
      .insert({ tenant_id: CODE_ACADEMY_TENANT, setting_key: SETTING_KEY, setting_value: settingRow.setting_value })
  }
  await deleteAliceSchoolMilestones()
  // Nothing of this spec's may leak into later specs that read the feed.
  const { count } = await db
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('author_id', ALICE_ID)
    .eq('post_type', 'milestone')
  expect(count).toBe(0)
})

test('completing the last lesson posts one milestone in the course feed', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAsTenantStudent(page)

  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${courseId}/lessons/${lessonIds[1]}`)
  const toggle = page.getByTestId('lesson-complete-toggle')
  await expect(toggle).toHaveCount(1, { timeout: 30_000 })
  await expect(toggle).toBeEnabled({ timeout: 30_000 })
  await domClick(toggle)

  await expect.poll(async () => (await courseMilestones()).length, { timeout: 30_000 }).toBe(1)
  const [post] = await courseMilestones()
  expect(post.milestone_type).toBe('course_completion')
  expect(post.milestone_data).toMatchObject({ course_id: courseId, course_title: COURSE_TITLE })

  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/courses/${courseId}/community`)
  const milestone = page.getByTestId('milestone-card').filter({ hasText: COURSE_TITLE })
  await expect(milestone).toHaveCount(1, { timeout: 30_000 })
  await expect(milestone).toHaveText(`Completed ${COURSE_TITLE}`)
  await expect(milestone).toHaveAttribute('data-milestone-type', 'course_completion')

  // Innermost PostCard root around the milestone (ancestors come first in DOM order).
  const card = page.locator('div.rounded-xl', { has: milestone }).last()
  // The opt-out is one click away from the automatic post; editing is not offered.
  await domClick(card.getByRole('button', { name: 'Post actions' }))
  await expect(page.getByRole('menuitem', { name: 'Sharing settings' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('menuitem', { name: 'Edit Post' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await domClick(card.getByRole('button', { name: 'Like' }))
  await expect.poll(async () => (await courseMilestones())[0]?.reaction_count, { timeout: 20_000 }).toBe(1)

  await domClick(card.getByRole('button', { name: 'Show comments' }))
  const reply = card.getByPlaceholder('Write a reply...')
  await expect(reply).toBeVisible({ timeout: 20_000 })
  const comment = `${MARK} well done`
  await reply.fill(comment)
  await domClick(card.getByRole('button', { name: 'Reply', exact: true }))
  await expect.poll(async () => (await courseMilestones())[0]?.comment_count, { timeout: 20_000 }).toBe(1)
  // The row lands before createComment returns, and React mirrors a controlled
  // textarea's value into its text, so getByText(comment) matches the box until
  // it is cleared. Cleared = the action returned; only then is the text the comment.
  await expect(reply).toHaveValue('', { timeout: 20_000 })
  await expect(card.getByText(comment)).toBeVisible({ timeout: 20_000 })

  // "Sharing settings" lands on the toggle itself. The href carries the locale:
  // a locale-less one is redirected by proxy.ts and the fragment is dropped.
  const settingsPath = `/${LOCALE}/dashboard/student/profile#share-milestones`
  await domClick(card.getByRole('button', { name: 'Post actions' }))
  const settingsLink = page.getByRole('menuitem', { name: 'Sharing settings' })
  await expect(settingsLink).toHaveAttribute('href', settingsPath, { timeout: 10_000 })
  await domClick(settingsLink)
  await expect(page).toHaveURL(`${TENANT_BASE}${settingsPath}`, { timeout: 30_000 })
  const shareToggle = page
    .getByTestId('share-milestones-toggle')
    .getByRole('switch', { name: 'Share my milestones in the community' })
  await expect(shareToggle).toBeVisible({ timeout: 30_000 })
  await expect(shareToggle).toBeInViewport()
})

test('through RLS: reactions and comments work, milestone inserts are refused', async () => {
  test.setTimeout(60_000)
  const [post] = await courseMilestones()
  expect(post).toBeTruthy()

  // No `.select()`: the course-post SELECT policy wants an enrollments row,
  // and the fixture grants access through an entitlement only.
  const alice = await signIn(ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password)
  const reaction = await alice
    .from('community_reactions')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, user_id: ALICE_ID, post_id: post.id, reaction_type: 'helpful' })
  expect(reaction.error).toBeNull()
  const comment = await alice
    .from('community_comments')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, author_id: ALICE_ID, post_id: post.id, content: `${MARK} via RLS` })
  expect(comment.error).toBeNull()
  await expect
    .poll(async () => {
      const [row] = await courseMilestones()
      return [row?.reaction_count, row?.comment_count]
    })
    .toEqual([2, 2])

  // Alice cannot fake one…
  const forged = await alice.from('community_posts').insert({
    tenant_id: CODE_ACADEMY_TENANT,
    author_id: ALICE_ID,
    content: '',
    post_type: 'milestone',
    milestone_type: 'level_up',
    milestone_data: { level: 99 },
  })
  expect(forged.error).not.toBeNull()

  // …and neither can staff, who may post everything else.
  const creator = await signIn(ACCOUNTS.admin.email, ACCOUNTS.admin.password)
  const control = await creator
    .from('community_posts')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, author_id: CREATOR_ID, content: `${MARK} staff control` })
  expect(control.error).toBeNull()
  const staffMilestone = await creator.from('community_posts').insert({
    tenant_id: CODE_ACADEMY_TENANT,
    author_id: CREATOR_ID,
    content: `${MARK} staff milestone`,
    post_type: 'milestone',
    milestone_type: 'streak',
    milestone_data: { days: 100 },
  })
  expect(staffMilestone.error).not.toBeNull()
  await admin().from('community_posts').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('content', `${MARK} staff%`)
})

test('uncompleting and completing again does not post twice', async () => {
  const { error } = await admin().from('lesson_completions').delete().eq('user_id', ALICE_ID).eq('lesson_id', lessonIds[1])
  expect(error).toBeNull()
  await completeLesson(lessonIds[1])
  expect(await courseMilestones()).toHaveLength(1)
})

test('with the school switch off nothing is posted', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsAdmin(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/community`)
  // The sidebar has its own "Settings".
  await domClick(page.locator('[data-tour="community-header"]').getByRole('button', { name: 'Settings' }))
  const toggle = page.getByRole('switch', { name: 'Share student milestones' })
  await expect(toggle).toBeChecked({ timeout: 10_000 })
  await domClick(toggle)

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from('tenant_settings')
          .select('setting_value')
          .eq('tenant_id', CODE_ACADEMY_TENANT)
          .eq('setting_key', SETTING_KEY)
          .maybeSingle()
        return (data?.setting_value as { enabled?: boolean } | null)?.enabled
      },
      { timeout: 20_000 }
    )
    .toBe(false)

  try {
    await resetCourse()
    await completeLesson(lessonIds[0])
    await completeLesson(lessonIds[1])
    expect(await courseMilestones()).toHaveLength(0)
  } finally {
    // Missing row = ON.
    await admin().from('tenant_settings').delete().eq('tenant_id', CODE_ACADEMY_TENANT).eq('setting_key', SETTING_KEY)
  }
})

test('a student who opts out is not announced', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsTenantStudent(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/profile`)
  const wrapper = page.getByTestId('share-milestones-toggle')
  await expect(wrapper).toBeVisible({ timeout: 30_000 })
  const toggle = wrapper.getByRole('switch', { name: 'Share my milestones in the community' })
  await expect(toggle).toBeChecked()
  await domClick(toggle)

  await expect
    .poll(
      async () => (await admin().from('profiles').select('share_milestones').eq('id', ALICE_ID).single()).data?.share_milestones,
      { timeout: 20_000 }
    )
    .toBe(false)

  try {
    await resetCourse()
    await completeLesson(lessonIds[0])
    await completeLesson(lessonIds[1])
    expect(await courseMilestones()).toHaveLength(0)
  } finally {
    await admin().from('profiles').update({ share_milestones: true }).eq('id', ALICE_ID)
  }
})

test('level 5 and a 7-day streak show in the school feed', async ({ page }) => {
  test.setTimeout(120_000)
  await deleteAliceSchoolMilestones()
  // Below both thresholds (announces nothing), then across both.
  for (const values of [
    { level: 4, current_streak: 6 },
    { level: 5, current_streak: 7 },
  ]) {
    const { error } = await admin()
      .from('gamification_profiles')
      .update(values)
      .eq('user_id', ALICE_ID)
      .eq('tenant_id', CODE_ACADEMY_TENANT)
    expect(error).toBeNull()
  }

  const { data: posts } = await admin()
    .from('community_posts')
    .select('milestone_type, milestone_data')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('author_id', ALICE_ID)
    .eq('post_type', 'milestone')
    .is('course_id', null)
  expect(posts?.map((p) => p.milestone_data).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
    { days: 7 },
    { level: 5 },
  ])

  await loginAsTenantStudent(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/community`)
  await expect(page.getByTestId('milestone-card').filter({ hasText: 'Reached level 5' })).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('milestone-card').filter({ hasText: 'Reached a 7-day streak' })).toHaveCount(1)
})
