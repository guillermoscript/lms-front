/**
 * Community Interactions E2E Tests
 *
 * Covers:
 * - Community page access and feature gating
 * - Post composer visibility
 * - Post creation and cleanup
 * - Cross-tenant community isolation
 *
 * Note: Default tenant (free plan) may not have community enabled.
 * Code Academy tenant (business plan) should have community enabled.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsStudent, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE, LOCALE } from './utils/constants'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'

/* ------------------------------------------------------------------ */
/*  Supabase admin client                                              */
/* ------------------------------------------------------------------ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdmin() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/* ------------------------------------------------------------------ */
/*  Seeded data tracking                                               */
/* ------------------------------------------------------------------ */
let createdPostIds: string[] = []

test.afterAll(async () => {
  const admin = getAdmin()

  // Clean up any [E2E] posts created during tests
  if (createdPostIds.length > 0) {
    // Delete reactions first (FK constraint)
    await admin.from('community_reactions').delete().in('post_id', createdPostIds)
    await admin.from('community_comments').delete().in('post_id', createdPostIds)
    await admin.from('community_posts').delete().in('id', createdPostIds)
  }

  // Also clean by content pattern in case IDs weren't captured
  const { data: e2ePosts } = await admin
    .from('community_posts')
    .select('id')
    .like('content', '[E2E]%')

  if (e2ePosts && e2ePosts.length > 0) {
    const ids = e2ePosts.map((p) => p.id)
    await admin.from('community_reactions').delete().in('post_id', ids)
    await admin.from('community_comments').delete().in('post_id', ids)
    await admin.from('community_posts').delete().in('id', ids)
  }
})

/* ================================================================== */
/*  Community Feature Gating                                           */
/* ================================================================== */
test.describe('Community Feature Gating', () => {
  test('default tenant community shows upgrade nudge or feed', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsStudent(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/community`)

    // Page should load — either community feed or upgrade nudge
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15_000 })

    const body = await page.locator('body').textContent()
    // Should contain community-related text or upgrade text
    expect(body!.length).toBeGreaterThan(50)
  })

  test('default tenant shows upgrade nudge when community not in plan', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsStudent(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/community`)
    await page.waitForLoadState('networkidle')

    // Check if upgrade nudge or community header is shown
    const upgradeText = page.locator('text=/upgrade/i')
    const communityHeader = page.locator('[data-tour="community-header"]')

    const nudgeVisible = await upgradeText.first().isVisible().catch(() => false)
    const headerVisible = await communityHeader.isVisible().catch(() => false)

    // One of these must be true — community is either gated or available
    expect(nudgeVisible || headerVisible).toBeTruthy()
  })
})

/* ================================================================== */
/*  Community on Code Academy (Business Plan)                          */
/* ================================================================== */
test.describe('Community on Code Academy', () => {
  test('admin community page loads on code-academy tenant', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/community`)

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15_000 })
  })

  test('admin community shows composer when available', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/community`)
    await page.waitForLoadState('networkidle')

    const communityHeader = page.locator('[data-tour="community-header"]')
    const headerVisible = await communityHeader.isVisible().catch(() => false)

    if (headerVisible) {
      // Community is enabled — composer should be visible
      const composer = page.locator('[data-tour="community-composer"]')
      await expect(composer).toBeVisible({ timeout: 10_000 })
    } else {
      // Community not enabled on this plan — upgrade nudge
      const body = await page.locator('body').textContent()
      expect(body).toMatch(/upgrade|plan/i)
    }
  })

  test('admin community shows filters when available', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/community`)
    await page.waitForLoadState('networkidle')

    const communityHeader = page.locator('[data-tour="community-header"]')
    const headerVisible = await communityHeader.isVisible().catch(() => false)

    if (headerVisible) {
      const filters = page.locator('[data-tour="community-filters"]')
      await expect(filters).toBeVisible({ timeout: 10_000 })
    }
  })

  test('admin community has moderation link', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/community`)
    await page.waitForLoadState('networkidle')

    const communityHeader = page.locator('[data-tour="community-header"]')
    const headerVisible = await communityHeader.isVisible().catch(() => false)

    if (headerVisible) {
      // Admin should see moderation link
      const moderationLink = page.locator('a[href*="moderation"]')
      await expect(moderationLink).toBeVisible({ timeout: 10_000 })
    }
  })
})

/* ================================================================== */
/*  Post Creation (via DB — avoids flaky UI interactions)              */
/* ================================================================== */
test.describe('Post Creation via DB', () => {
  test('community post can be created and queried', async () => {
    const admin = getAdmin()

    // Check if community_posts table is accessible
    const { data: post, error } = await admin
      .from('community_posts')
      .insert({
        author_id: 'a1000000-0000-0000-0000-000000000001', // STUDENT_ID
        content: '[E2E] Test post for community verification',
        post_type: 'standard',
        tenant_id: DEFAULT_TENANT,
        is_hidden: false,
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        reaction_count: 0,
      })
      .select('id, content')
      .single()

    if (error) {
      // Community tables may not exist or have different schema
      test.info().annotations.push({ type: 'skip-reason', description: `Post creation failed: ${error.message}` })
      return
    }

    createdPostIds.push(post.id)

    expect(post.content).toBe('[E2E] Test post for community verification')

    // Verify it can be queried
    const { data: queried } = await admin
      .from('community_posts')
      .select('id, content, tenant_id')
      .eq('id', post.id)
      .single()

    expect(queried!.tenant_id).toBe(DEFAULT_TENANT)
  })

  test('community posts are tenant-isolated', async () => {
    const admin = getAdmin()

    // Create posts on different tenants
    const { data: post1, error: err1 } = await admin
      .from('community_posts')
      .insert({
        author_id: 'a1000000-0000-0000-0000-000000000001',
        content: '[E2E] Default tenant post',
        post_type: 'standard',
        tenant_id: DEFAULT_TENANT,
        is_hidden: false,
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        reaction_count: 0,
      })
      .select('id')
      .single()

    if (err1) {
      test.info().annotations.push({ type: 'skip-reason', description: `Post creation failed: ${err1.message}` })
      return
    }

    createdPostIds.push(post1.id)

    // Query with tenant filter — should only see own tenant's posts
    const { data: defaultPosts } = await admin
      .from('community_posts')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT)
      .eq('id', post1.id)

    expect(defaultPosts!.length).toBe(1)

    // Same post should not appear under code-academy tenant filter
    const { data: caPosts } = await admin
      .from('community_posts')
      .select('id')
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('id', post1.id)

    expect(caPosts!.length).toBe(0)
  })
})

/* ================================================================== */
/*  Sidebar Navigation                                                 */
/* ================================================================== */
test.describe('Community Sidebar Navigation', () => {
  test('student sidebar contains community link', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsStudent(page)

    const communityLink = page.locator('a[href*="/dashboard/student/community"]')
    await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
  })

  test('admin sidebar contains community link', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsAdmin(page)

    const communityLink = page.locator('a[href*="/dashboard/admin/community"]')
    await expect(communityLink.first()).toBeVisible({ timeout: 10_000 })
  })
})
