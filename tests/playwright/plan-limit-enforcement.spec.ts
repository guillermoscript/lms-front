/**
 * Issue #658 — plan limits are enforced by the database, not just by the
 * `checkCourseLimit()` pre-check in the create-course action.
 *
 * Runs against Default School (Free: max_courses 5). The service-role client
 * fills the tenant to its limit, then proves that:
 *   1. a direct insert past the limit — the shape of the MCP `lms_create_course`
 *      path and of raw SQL — is refused with SQLSTATE `LM001`;
 *   2. the `get_tenant_plan_usage` RPC behind the MCP pre-check refuses anon;
 *   3. an admin restoring an archived course through the UI sees the upgrade
 *      copy instead of a generic failure;
 *   4. archiving one course frees the slot and the same restore succeeds.
 *
 * Local run: `PORT=3005 npm run dev`, then
 *   npx playwright test plan-limit-enforcement --workers=1
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

const TITLE_PREFIX = 'E2E #658'
const ARCHIVED_TITLE = `${TITLE_PREFIX} archived course`

type Usage = { courses: number; max_courses: number }

async function usage(): Promise<Usage> {
  const { data, error } = await admin.rpc('get_tenant_plan_usage', { _tenant_id: DEFAULT_TENANT })
  if (error) throw error
  return data as Usage
}

test.describe.serial('Plan limits enforced by the database (#658)', () => {
  const created: number[] = []
  let authorId: string
  let archivedId: number

  test.beforeAll(async () => {
    // Leftovers from an interrupted run must not skew the count.
    await admin.from('courses').delete().eq('tenant_id', DEFAULT_TENANT).like('title', `${TITLE_PREFIX}%`)

    const { data: staff } = await admin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', DEFAULT_TENANT)
      .in('role', ['admin', 'teacher'])
      .eq('status', 'active')
      .limit(1)
      .single()
    authorId = staff!.user_id

    const before = await usage()
    expect(before.max_courses, 'Default School must be on a limited plan').toBe(5)

    for (let i = before.courses; i < before.max_courses; i++) {
      const { data, error } = await admin
        .from('courses')
        .insert({ title: `${TITLE_PREFIX} filler ${i + 1}`, author_id: authorId, tenant_id: DEFAULT_TENANT, status: 'draft' })
        .select('course_id')
        .single()
      if (error) throw error
      created.push(data.course_id)
    }

    // An archived course never consumes a slot, so this one is allowed at the cap.
    const { data: archived, error } = await admin
      .from('courses')
      .insert({ title: ARCHIVED_TITLE, author_id: authorId, tenant_id: DEFAULT_TENANT, status: 'archived' })
      .select('course_id')
      .single()
    if (error) throw error
    archivedId = archived.course_id
    created.push(archivedId)

    expect((await usage()).courses).toBe(5)
  })

  test.afterAll(async () => {
    if (created.length) await admin.from('courses').delete().in('course_id', created)
  })

  test('a direct insert past the limit is refused with LM001', async () => {
    const { error } = await admin
      .from('courses')
      .insert({ title: `${TITLE_PREFIX} one too many`, author_id: authorId, tenant_id: DEFAULT_TENANT, status: 'draft' })
      .select('course_id')
      .single()

    expect(error?.code).toBe('LM001')
    expect(error?.message).toBe('plan_limit_exceeded:courses')
    expect((await usage()).courses).toBe(5)
  })

  test('un-archiving past the limit is refused at the database', async () => {
    const { error } = await admin.from('courses').update({ status: 'published' }).eq('course_id', archivedId)
    expect(error?.code).toBe('LM001')
  })

  test('the usage RPC refuses anonymous callers', async () => {
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { data, error } = await anon.rpc('get_tenant_plan_usage', { _tenant_id: DEFAULT_TENANT })
    expect(data).toBeNull()
    expect(error?.message).toContain('authentication required')
  })

  test('admin restore at the limit shows the upgrade message, and succeeds once a slot is free', async ({ page, isMobile }) => {
    // The base-ui dropdown → confirm-dialog chain does not complete under touch
    // emulation; the DB-level assertions above already run on every project.
    test.skip(isMobile, 'base-ui dropdown menu is not reliable under mobile emulation')
    // The shared login helper re-tries past hydration for up to ~45s on a cold
    // dev server; the default 30s test budget is shorter than the helper's own.
    test.setTimeout(120_000)
    await loginAsTeacher(page, BASE) // owner@e2etest.com — Default School admin
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/courses`)
    await expect(page.getByTestId('admin-courses-page')).toBeVisible()

    const restoreViaMenu = async () => {
      const row = page.getByRole('row', { name: new RegExp(ARCHIVED_TITLE) })
      await expect(row).toBeVisible()
      // base-ui buttons ignore synthetic Playwright clicks; dispatch a real one.
      await row.getByRole('button').last().evaluate((el) => (el as HTMLElement).click())
      await page.getByRole('menuitem', { name: /restore/i }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: /restore/i }).click()
    }

    await restoreViaMenu()
    await expect(page.getByText(/limited to 5 courses/i)).toBeVisible()
    expect((await usage()).courses).toBe(5)

    // Free a slot the way the copy tells the admin to, then the same restore goes through.
    const { error } = await admin.from('courses').update({ status: 'archived' }).eq('course_id', created[0])
    expect(error).toBeNull()

    await page.reload()
    await restoreViaMenu()
    await expect(page.getByText(/restored/i).first()).toBeVisible()
    await expect.poll(async () => (await admin.from('courses').select('status').eq('course_id', archivedId).single()).data?.status).toBe('published')
    expect((await usage()).courses).toBe(5)
  })
})
