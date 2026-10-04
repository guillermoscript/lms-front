import { test, expect, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loginAsStudent, loginAsTeacher, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'
import { openSidebarGroup } from './utils/sidebar'
import { getAdmin, SEEDED } from './utils/plan-gate-fixtures'

/**
 * P1 — Community Spaces Tests
 *
 * Covers community page loads for all roles, page structure verification,
 * and cross-tenant isolation, plus the entry points into the course
 * communities (#868). The #868 block creates its own courses, entitlement and
 * posts in Code Academy with the service role and removes them afterwards;
 * everything else here only reads.
 */

test.describe('Community Spaces', () => {
  test.describe('Student Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('student community page loads with header', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)

      // Page should load — either the community feed or an upgrade nudge
      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('student community shows feed structure or upgrade nudge', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      // Either the community feed renders (with tour anchors) or an upgrade nudge is shown
      const communityHeader = page.locator('[data-tour="community-header"]')
      const upgradeNudge = page.locator('text=/upgrade/i')

      // One of these must be visible
      const headerVisible = await communityHeader.isVisible().catch(() => false)
      const nudgeVisible = await upgradeNudge.first().isVisible().catch(() => false)

      expect(headerVisible || nudgeVisible).toBeTruthy()
    })

    test('student community shows composer and filters when available', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // If community is available, composer and filters should be present
        const composer = page.locator('[data-tour="community-composer"]')
        const filters = page.locator('[data-tour="community-filters"]')

        await expect(composer).toBeVisible({ timeout: 10_000 })
        await expect(filters).toBeVisible({ timeout: 10_000 })
      } else {
        // If community is not available, upgrade nudge should be shown
        const body = page.locator('body')
        await expect(body).toContainText(/upgrade|plan/i)
      }
    })

    test('student community shows feed or empty state', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // Feed area should render — either with posts or empty state
        const feedArea = page.locator('[data-tour="community-feed"]')
        const emptyState = page.locator('text=/no posts|be the first|empty/i')

        const feedVisible = await feedArea.isVisible().catch(() => false)
        const emptyVisible = await emptyState.first().isVisible().catch(() => false)

        expect(feedVisible || emptyVisible).toBeTruthy()
      }
    })
  })

  test.describe('Teacher Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTeacher(page)
    })

    test('teacher community page loads with header', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('teacher community shows feed structure or upgrade nudge', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const upgradeNudge = page.locator('text=/upgrade/i')

      const headerVisible = await communityHeader.isVisible().catch(() => false)
      const nudgeVisible = await upgradeNudge.first().isVisible().catch(() => false)

      expect(headerVisible || nudgeVisible).toBeTruthy()
    })
  })

  test.describe('Admin Community', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('admin community page loads with header', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })
    })

    test('admin community shows moderation button when community is available', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)
      await page.waitForLoadState('networkidle')

      const communityHeader = page.locator('[data-tour="community-header"]')
      const headerVisible = await communityHeader.isVisible().catch(() => false)

      if (headerVisible) {
        // Admin should see the moderation link
        const moderationLink = page.locator('a[href*="moderation"]')
        await expect(moderationLink).toBeVisible({ timeout: 10_000 })

        // Moderation tour anchor should be present
        const moderationTour = page.locator('[data-tour="community-moderation"]')
        await expect(moderationTour).toBeVisible()
      }
    })
  })

  test.describe('Sidebar Navigation', () => {
    test('student sidebar contains community link', async ({ page }) => {
      await loginAsStudent(page)

      const communityLink = page.locator('a[href*="/dashboard/student/community"]')
      await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
    })

    test('admin sidebar contains community link', async ({ page }) => {
      await loginAsAdmin(page)

      // Community is a sub-link of the collapsible "People" group.
      await openSidebarGroup(page, 'People')
      const communityLink = page.locator('a[href*="/dashboard/admin/community"]')
      await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Cross-Tenant Isolation', () => {
    test('tenant admin community page loads on tenant subdomain', async ({ page }) => {
      test.setTimeout(60_000)

      await loginAsAdmin(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/admin/community`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })

      // Page should not show error states
      const errorText = page.locator('text=/error|500|404/i')
      await expect(errorText).not.toBeVisible()
    })
  })
})

/* ================================================================== */
/*  Course community entry points (#868)                               */
/* ================================================================== */

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
/** creator@codeacademy.com — Code Academy admin, author of 2001/2002. */
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
/** Fixture course titles. Cleanup keys on this prefix (Code Academy only). */
const COURSE_PREFIX = '[E2E] 868'
/**
 * Fixture post prefix. Deliberately not `[E2E]…`: community-interactions
 * sweeps every post whose content starts with that, in every school.
 */
const POST_PREFIX = '[E2E-868]'
const PYTHON = 2001 // Python for Beginners — Alice holds a product entitlement (seed)
const PYTHON_LESSON = 2001

const fixture = { open: 0, noAccess: 0, welcome: 0 }

async function removeCourseFixtures(admin: SupabaseClient) {
  const { data: stale } = await admin
    .from('courses')
    .select('course_id')
    .eq('tenant_id', CODE_ACADEMY)
    .like('title', `${COURSE_PREFIX}%`)
  const ids = (stale ?? []).map((c) => c.course_id as number)

  // Posts before courses: community_posts.course_id is ON DELETE SET NULL, so a
  // course deleted first would drop its posts into the school feed.
  await admin.from('community_posts').delete().eq('tenant_id', CODE_ACADEMY).like('title', `${POST_PREFIX}%`)
  if (ids.length === 0) return
  await admin.from('community_posts').delete().eq('tenant_id', CODE_ACADEMY).in('course_id', ids)
  await admin
    .from('user_ui_state')
    .delete()
    .eq('user_id', CREATOR_ID)
    .in(
      'key',
      ids.map((id) => `checklist:community-welcome-${id}`)
    )
  await admin.from('entitlements').delete().eq('tenant_id', CODE_ACADEMY).in('course_id', ids)
  await admin.from('courses').delete().eq('tenant_id', CODE_ACADEMY).in('course_id', ids)
}

/**
 * Press a base-ui button (by its exact name, within `scope`) until `settled`
 * holds: a click that lands before hydration does nothing. Once pressed for
 * real the button may be gone, so a retry only clicks while it is still there.
 */
async function pressUntil(scope: Page | Locator, name: string, settled: () => Promise<void>) {
  await expect(async () => {
    const button = scope.getByRole('button', { name, exact: true })
    if (await button.isVisible()) await button.click({ timeout: 2_000 })
    await settled()
  }).toPass({ timeout: 20_000 })
}

test.describe('Course community entry points (#868)', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 })

  test.beforeAll(async () => {
    const admin = getAdmin()
    // Idempotent: a retried run starts from nothing.
    await removeCourseFixtures(admin)

    const publishedAt = new Date().toISOString()
    const { data: courses, error } = await admin
      .from('courses')
      .insert([
        // Draft: never listed anywhere else, yet open to Alice through her grant.
        { title: `${COURSE_PREFIX} open`, status: 'draft', tenant_id: CODE_ACADEMY, author_id: CREATOR_ID },
        {
          title: `${COURSE_PREFIX} no access`,
          status: 'published',
          published_at: publishedAt,
          tenant_id: CODE_ACADEMY,
          author_id: CREATOR_ID,
        },
        {
          title: `${COURSE_PREFIX} welcome`,
          status: 'published',
          published_at: publishedAt,
          tenant_id: CODE_ACADEMY,
          author_id: CREATOR_ID,
        },
      ])
      .select('course_id, title')
    if (error || !courses) throw new Error(`could not create #868 courses: ${error?.message}`)
    const idOf = (suffix: string) => courses.find((c) => c.title === `${COURSE_PREFIX} ${suffix}`)!.course_id as number
    fixture.open = idOf('open')
    fixture.noAccess = idOf('no access')
    fixture.welcome = idOf('welcome')

    const { error: grantError } = await admin.from('entitlements').insert({
      user_id: SEEDED.alice.id,
      course_id: fixture.open,
      tenant_id: CODE_ACADEMY,
      source_type: 'admin_grant',
      source_id: null,
      status: 'active',
    })
    if (grantError) throw new Error(`could not grant the #868 course: ${grantError.message}`)
  })

  test.afterAll(async () => {
    await removeCourseFixtures(getAdmin())
  })

  test('student opens a course, clicks Community and lands on that course feed', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${PYTHON}`)

    const entry = page.getByTestId('course-community-entry')
    await expect(entry).toBeVisible({ timeout: 20_000 })
    await entry.click()

    await page.waitForURL(new RegExp(`/dashboard/student/courses/${PYTHON}/community$`), { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1, name: /Python for Beginners.*Community/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to course' })).toBeVisible()
    await expect(page.getByText('community.backToCourse')).toHaveCount(0)
  })

  test('an empty course feed invites the first post instead of hiding the link', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${fixture.open}`)

    const hint = page.getByTestId('course-community-hint')
    await expect(hint).toBeVisible({ timeout: 20_000 })
    await expect(hint).toContainText('No posts yet')
    await expect(hint).toContainText('Be the first to introduce yourself')
  })

  test('the hint reports recent activity and the newest post', async ({ page }) => {
    const { error } = await getAdmin()
      .from('community_posts')
      .insert({
        tenant_id: CODE_ACADEMY,
        author_id: CREATOR_ID,
        course_id: fixture.open,
        post_type: 'standard',
        title: `${POST_PREFIX} Week one check-in`,
        content: `${POST_PREFIX} How is everyone getting on?`,
      })
    if (error) throw new Error(`could not create the #868 post: ${error.message}`)

    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${fixture.open}`)

    const hint = page.getByTestId('course-community-hint')
    await expect(hint).toBeVisible({ timeout: 20_000 })
    await expect(hint).toContainText('1 post in the last 7 days')
    await expect(hint).toContainText(`Latest: “${POST_PREFIX} Week one check-in”`)
  })

  test('the lesson sidebar links to the course community', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${PYTHON}/lessons/${PYTHON_LESSON}`)

    // The desktop sidebar and the (unopened) mobile sheet can both hold one.
    const link = page.getByTestId('lesson-sidebar-community-link').filter({ visible: true })
    await expect(link).toBeVisible({ timeout: 20_000 })
    await expect(link).toHaveAttribute('href', new RegExp(`/dashboard/student/courses/${PYTHON}/community$`))
  })

  test('the school feed links to every course feed the student can open, and no other', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/community`)

    const links = page.getByTestId('course-community-links')
    await expect(links).toBeVisible({ timeout: 20_000 })
    const feedLink = (id: number) => links.locator(`a[href$="/dashboard/student/courses/${id}/community"]`)
    await expect(feedLink(PYTHON)).toBeVisible()
    await expect(feedLink(fixture.open)).toBeVisible()
    await expect(feedLink(fixture.noAccess)).toHaveCount(0)
    await expect(feedLink(fixture.welcome)).toHaveCount(0)

    await feedLink(fixture.open).click()
    await page.waitForURL(new RegExp(`/dashboard/student/courses/${fixture.open}/community$`), { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1, name: `${COURSE_PREFIX} open — Community` })).toBeVisible()
  })

  test('a course feed without access still redirects', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${fixture.noAccess}/community`)
    await page.waitForURL(/\/dashboard\/student\/?$/, { timeout: 20_000 })
  })

  test('no student entry point when the school has no community (free plan)', async ({ page }) => {
    await loginAsStudent(page)

    await page.goto(`${BASE}/en/dashboard/student/courses/1001`)
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Testing' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByTestId('course-community-entry')).toHaveCount(0)

    await page.goto(`${BASE}/en/dashboard/student/courses/1001/lessons/1001`)
    // The seeded lesson body opens with its own `# What is Software Testing?`,
    // so the title is an h1 twice (lesson header + content): take the header's.
    await expect(page.getByRole('heading', { level: 1, name: 'What is Software Testing?' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByTestId('lesson-sidebar-community-link')).toHaveCount(0)

    await page.goto(`${BASE}/en/dashboard/student/community`)
    await expect(page.getByTestId('upgrade-nudge')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('course-community-links')).toHaveCount(0)
  })

  test('no teacher entry point or welcome offer when the school has no community', async ({ page }) => {
    await loginAsTeacher(page)
    await page.goto(`${BASE}/en/dashboard/teacher/courses/1001`)

    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Testing' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByTestId('teacher-course-community-link')).toHaveCount(0)
    await expect(page.getByTestId('course-welcome-prompt')).toHaveCount(0)
  })

  test('the teacher course page links to its course feed', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/${PYTHON}`)

    const link = page.getByTestId('teacher-course-community-link')
    await expect(link).toBeVisible({ timeout: 20_000 })
    await expect(link).toHaveAttribute('href', `/dashboard/teacher/courses/${PYTHON}/community`)
    await link.click()
    await page.waitForURL(new RegExp(`/dashboard/teacher/courses/${PYTHON}/community$`), { timeout: 20_000 })
  })

  test('the author of a published, empty course pins a welcome prompt', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/${fixture.welcome}`)

    const prompt = page.getByTestId('course-welcome-prompt')
    await expect(prompt).toBeVisible({ timeout: 20_000 })
    const defaultContent = `Welcome to ${COURSE_PREFIX} welcome. Tell us who you are, where you’re joining from and what you hope to learn in this course.`

    // The pre-filled text is on show before anything is pressed.
    const preview = prompt.getByTestId('course-welcome-preview')
    await expect(preview).toContainText('Introduce yourself')
    await expect(preview).toContainText(defaultContent)

    // "Edit" opens it in fields; "Cancel" drops the edit and goes back.
    const title = prompt.getByLabel('Title')
    await pressUntil(prompt, 'Edit', () => expect(title).toBeVisible({ timeout: 2_000 }))
    await expect(title).toHaveValue('Introduce yourself')
    await expect(prompt.getByLabel('Message')).toHaveValue(defaultContent)
    await title.fill(`${POST_PREFIX} discarded draft`)
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(title).toHaveCount(0)
    await expect(preview).toContainText('Introduce yourself')
    await expect(preview).not.toContainText('discarded draft')
    await expect(prompt.getByRole('button', { name: 'Edit', exact: true })).toBeFocused()

    // One click posts the pre-filled prompt as it is.
    await prompt.getByRole('button', { name: 'Post and pin', exact: true }).click()

    await page.waitForURL(new RegExp(`/dashboard/teacher/courses/${fixture.welcome}/community$`), { timeout: 20_000 })
    const feed = page.locator('[data-tour="community-feed"]')
    await expect(feed.getByText('Introduce yourself', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(feed.getByText('Pinned', { exact: true })).toBeVisible()

    const { data: posts } = await getAdmin()
      .from('community_posts')
      .select('post_type, is_pinned, author_id, tenant_id, title, content')
      .eq('course_id', fixture.welcome)
    expect(posts).toEqual([
      {
        post_type: 'discussion_prompt',
        is_pinned: true,
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY,
        title: 'Introduce yourself',
        content: defaultContent,
      },
    ])

    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/${fixture.welcome}`)
    await expect(page.getByTestId('teacher-course-community-link')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('course-welcome-prompt')).toHaveCount(0)
  })

  test('"Not now" dismisses the welcome offer for good', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/${fixture.noAccess}`)

    const prompt = page.getByTestId('course-welcome-prompt')
    await expect(prompt).toBeVisible({ timeout: 20_000 })
    await pressUntil(page, 'Not now', () => expect(prompt).toHaveCount(0, { timeout: 2_000 }))

    await expect
      .poll(
        async () => {
          const { data } = await getAdmin()
            .from('user_ui_state')
            .select('value')
            .eq('user_id', CREATOR_ID)
            .eq('key', `checklist:community-welcome-${fixture.noAccess}`)
            .maybeSingle()
          return data?.value ?? null
        },
        { timeout: 15_000 }
      )
      .toBe('dismissed')

    await page.reload()
    await expect(page.getByTestId('teacher-course-community-link')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('course-welcome-prompt')).toHaveCount(0)
  })
})
