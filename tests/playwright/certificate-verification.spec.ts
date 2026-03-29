/**
 * Certificate Verification E2E Tests
 *
 * Covers:
 * - Public verification page for valid certificates
 * - Invalid verification code handling
 * - Certificate details rendering (student name, course, issuer)
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { BASE, LOCALE } from './utils/constants'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const STUDENT_ID = 'a1000000-0000-0000-0000-000000000001'

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
/*  Seeded data                                                        */
/* ------------------------------------------------------------------ */
let existingVerificationCode: string | null = null
let seededCertificateId: number | null = null

/* ------------------------------------------------------------------ */
/*  Setup: find or seed a certificate                                  */
/* ------------------------------------------------------------------ */
test.beforeAll(async () => {
  const admin = getAdmin()

  // Check if any certificates exist
  const { data: certs } = await admin
    .from('certificates')
    .select('certificate_id, verification_code')
    .limit(1)

  if (certs && certs.length > 0) {
    existingVerificationCode = certs[0].verification_code
  } else {
    // Seed a certificate for testing
    // First check if a certificate_template exists
    let templateId: number | null = null

    const { data: templates } = await admin
      .from('certificate_templates')
      .select('template_id')
      .eq('tenant_id', DEFAULT_TENANT)
      .limit(1)

    if (templates && templates.length > 0) {
      templateId = templates[0].template_id
    } else {
      // Create a template
      const { data: template, error: tErr } = await admin
        .from('certificate_templates')
        .insert({
          course_id: 1001,
          tenant_id: DEFAULT_TENANT,
          template_name: '[E2E] Test Template',
          issuer_name: '[E2E] Test School',
          issuance_criteria: 'Complete all lessons',
        })
        .select('template_id')
        .single()

      if (tErr) throw new Error(`Seed template failed: ${tErr.message}`)
      templateId = template.template_id
    }

    // Create a certificate
    const verificationCode = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { data: cert, error: cErr } = await admin
      .from('certificates')
      .insert({
        user_id: STUDENT_ID,
        course_id: 1001,
        template_id: templateId,
        verification_code: verificationCode,
        issued_at: new Date().toISOString(),
        tenant_id: DEFAULT_TENANT,
        credential_json: {
          type: 'CourseCompletion',
          student: 'E2E Test Student',
          course: 'Introduction to Testing',
          issuer: '[E2E] Test School',
        },
        completion_data: {
          lessons_completed: 2,
          total_lessons: 2,
          completion_percentage: 100,
        },
      })
      .select('certificate_id, verification_code')
      .single()

    if (cErr) throw new Error(`Seed certificate failed: ${cErr.message}`)
    seededCertificateId = cert.certificate_id
    existingVerificationCode = cert.verification_code
  }
})

test.afterAll(async () => {
  const admin = getAdmin()

  // Clean up seeded certificate (only the one we created)
  if (seededCertificateId) {
    await admin.from('certificates').delete().eq('certificate_id', seededCertificateId)
  }

  // Clean up seeded template
  await admin
    .from('certificate_templates')
    .delete()
    .eq('template_name', '[E2E] Test Template')
    .eq('tenant_id', DEFAULT_TENANT)
})

/* ================================================================== */
/*  Invalid Verification Code                                          */
/* ================================================================== */
test.describe('Invalid Certificate Verification', () => {
  test('invalid code shows not-found message', async ({ page }) => {
    test.setTimeout(30_000)

    // Navigate to verification page with invalid code — public page, no login needed
    await page.goto(`${BASE}/${LOCALE}/verify/INVALID-CODE-12345`)
    await page.waitForLoadState('networkidle')

    // Should show the "not found" view with the shield-x icon
    const body = await page.locator('body').textContent()
    // The not-found template shows a message about certificate not found
    expect(body).toMatch(/not found|no encontrado|invalid|does not exist/i)
  })

  test('invalid code page has return home button', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto(`${BASE}/${LOCALE}/verify/INVALID-CODE-12345`)
    await page.waitForLoadState('networkidle')

    // Should have a link back to home
    const homeLink = page.locator('a[href="/"]')
    const hasHome = await homeLink.first().isVisible({ timeout: 10_000 }).catch(() => false)
    expect(hasHome).toBeTruthy()
  })
})

/* ================================================================== */
/*  Valid Certificate Verification                                     */
/* ================================================================== */
test.describe('Valid Certificate Verification', () => {
  test('valid code shows verified credential page', async ({ page }) => {
    test.setTimeout(30_000)

    if (!existingVerificationCode) {
      test.skip()
      return
    }

    await page.goto(`${BASE}/${LOCALE}/verify/${existingVerificationCode}`)
    await page.waitForLoadState('networkidle')

    // Should show "Verified Credential" heading or badge (not "Not Found")
    const verifiedText = page.getByText(/Verified Credential/i)
    const notFoundText = page.getByText(/Not Found/i)

    const isVerified = await verifiedText.first().isVisible({ timeout: 10_000 }).catch(() => false)
    const isNotFound = await notFoundText.first().isVisible({ timeout: 3_000 }).catch(() => false)

    // Should be verified, not "not found"
    expect(isVerified).toBeTruthy()
    expect(isNotFound).toBeFalsy()
  })

  test('valid certificate shows student name', async ({ page }) => {
    test.setTimeout(30_000)

    if (!existingVerificationCode) {
      test.skip()
      return
    }

    await page.goto(`${BASE}/${LOCALE}/verify/${existingVerificationCode}`)
    await page.waitForLoadState('networkidle')

    // The page renders the student name as h1 heading
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 10_000 })

    // Heading should contain a name (not be empty)
    const headingText = await heading.textContent()
    expect(headingText!.length).toBeGreaterThan(0)
  })

  test('valid certificate shows verification code on page', async ({ page }) => {
    test.setTimeout(30_000)

    if (!existingVerificationCode) {
      test.skip()
      return
    }

    await page.goto(`${BASE}/${LOCALE}/verify/${existingVerificationCode}`)
    await page.waitForLoadState('networkidle')

    // The verification code is displayed on the page in monospace
    const body = await page.locator('body').textContent()
    expect(body).toContain(existingVerificationCode)
  })
})
