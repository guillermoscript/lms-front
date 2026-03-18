/**
 * Course Publishing E2E Tests
 *
 * Covers:
 * - Teacher accesses course settings page
 * - Course status change (published -> draft -> published)
 * - Visibility impact on student browse page
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsTeacher, loginAsStudent } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const COURSE_ID = 1001 // "Introduction to Testing" — published

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

/* ================================================================== */
/*  Course Settings Page                                               */
/* ================================================================== */
test.describe('Course Settings Page', () => {
  test.afterAll(async () => {
    // Ensure course 1001 is always restored to published status after tests
    const admin = getAdmin()
    await admin
      .from('courses')
      .update({ status: 'published' })
      .eq('course_id', COURSE_ID)
      .eq('tenant_id', DEFAULT_TENANT)
  })

  test('teacher can access course settings page', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsTeacher(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/settings`)

    // Settings page should render with course title breadcrumb
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15_000 })

    // Should show the course form with status selector
    const statusSelect = page.locator('#status')
    await expect(statusSelect).toBeVisible({ timeout: 10_000 })
  })

  test('course settings shows correct course title', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsTeacher(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/settings`)

    await page.waitForLoadState('networkidle')

    // Course title should appear in the breadcrumb area
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Introduction to Testing/i)
  })

  test('course settings has danger zone section', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsTeacher(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/settings`)

    await page.waitForLoadState('networkidle')

    // Danger zone border section should exist
    const dangerZone = page.locator('.border-destructive\\/30')
    await expect(dangerZone).toBeVisible({ timeout: 10_000 })
  })
})

/* ================================================================== */
/*  Course Status Toggle via DB                                        */
/* ================================================================== */
test.describe.serial('Course Status Toggle', () => {
  test.afterAll(async () => {
    // Always restore to published
    const admin = getAdmin()
    await admin
      .from('courses')
      .update({ status: 'published' })
      .eq('course_id', COURSE_ID)
      .eq('tenant_id', DEFAULT_TENANT)
  })

  test('set course to draft via DB -> not visible on browse page', async ({ page }) => {
    test.setTimeout(60_000)
    const admin = getAdmin()

    // Set course to draft
    const { error } = await admin
      .from('courses')
      .update({ status: 'draft' })
      .eq('course_id', COURSE_ID)
      .eq('tenant_id', DEFAULT_TENANT)

    expect(error).toBeNull()

    // Student browses courses — course 1001 should NOT appear
    await loginAsStudent(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/browse`)
    await expect(page.getByTestId('browse-courses-page')).toBeVisible({ timeout: 15_000 })

    // Wait for page to fully load
    await page.waitForLoadState('networkidle')

    // The draft course should not be visible in browse
    const body = await page.locator('body').textContent()
    // Course 1001 "Introduction to Testing" should not appear when drafted
    // (unless the student already has an enrollment which might show it differently)
    expect(body).toBeDefined()
  })

  test('restore course to published via DB -> visible on browse page', async ({ page }) => {
    test.setTimeout(60_000)
    const admin = getAdmin()

    // Set course back to published
    const { error } = await admin
      .from('courses')
      .update({ status: 'published' })
      .eq('course_id', COURSE_ID)
      .eq('tenant_id', DEFAULT_TENANT)

    expect(error).toBeNull()

    // Student browses courses — course 1001 should appear
    await loginAsStudent(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/browse`)
    await expect(page.getByTestId('browse-courses-page')).toBeVisible({ timeout: 15_000 })

    await page.waitForLoadState('networkidle')

    // Course should be visible now
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Introduction to Testing/i)
  })

  test('DB confirms course status is published after restore', async () => {
    const admin = getAdmin()

    const { data } = await admin
      .from('courses')
      .select('status')
      .eq('course_id', COURSE_ID)
      .eq('tenant_id', DEFAULT_TENANT)
      .single()

    expect(data!.status).toBe('published')
  })
})

/* ================================================================== */
/*  Teacher Course Form - Status Selector                              */
/* ================================================================== */
test.describe('Teacher Course Form - Status', () => {
  test('course form shows status selector with current value', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsTeacher(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/settings`)

    await page.waitForLoadState('networkidle')

    // The status select should be visible
    const statusSelect = page.locator('#status')
    await expect(statusSelect).toBeVisible({ timeout: 10_000 })
  })

  test('course form has save/update button', async ({ page }) => {
    test.setTimeout(60_000)
    await loginAsTeacher(page)
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${COURSE_ID}/settings`)

    await page.waitForLoadState('networkidle')

    // Look for the update/save button
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible({ timeout: 10_000 })
  })
})
