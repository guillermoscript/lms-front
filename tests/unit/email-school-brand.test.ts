import { describe, it, expect } from 'vitest'
import { deriveBrandOutputs } from '@/lib/themes/brand-outputs'
import { platformSchoolBrand, type SchoolBrand } from '@/lib/themes/school-brand'
import { enrollmentConfirmedTemplate } from '@/lib/email/templates/enrollment-confirmed'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { joinedSchoolTemplate } from '@/lib/email/templates/joined-school'
import { certificateIssuedTemplate } from '@/lib/email/templates/certificate-issued'
import { courseRemovedTemplate } from '@/lib/email/templates/course-removed'
import { paymentInstructionsTemplate } from '@/lib/email/templates/payment-instructions'
import { dailyDigestEmailTemplate, streakNudgeEmailTemplate } from '@/lib/email/templates/daily-digest'
import { accessCutoffWarningTemplate } from '@/lib/email/templates/access-cutoff-warning'
import { downgradeBlockedTemplate } from '@/lib/email/templates/downgrade-blocked'
import { paymentFailedTemplate } from '@/lib/email/templates/payment-failed'
import { paymentRequestExpiredTemplate } from '@/lib/email/templates/payment-request-expired'
import { planDowngradedTemplate } from '@/lib/email/templates/plan-downgraded'
import { renewalReminderTemplate } from '@/lib/email/templates/renewal-reminder'
import { authOtpTemplate } from '@/lib/email/templates/auth-otp'

/**
 * Issue #765 — the 7 school-branded transactional emails carry the school's
 * logo, brand colour and heading font instead of the platform's hardcoded
 * `#2563eb`. Brands are built with `deriveBrandOutputs` directly (pure, no DB)
 * so this suite never touches Supabase.
 */

function brandFor(theme: 'andina' | 'kodigo' | null, brandHex: string, logoUrl: string | null = null): SchoolBrand {
  const stored = theme ? { type: 'kit' as const, theme, brand: brandHex } : null
  return {
    tenantId: 'tenant-1',
    name: 'Test School',
    logoUrl,
    theme: stored,
    outputs: deriveBrandOutputs(stored),
  }
}

const ANDINA = brandFor('andina', '#2F6B4F')
const KODIGO = brandFor('kodigo', '#F2B705')
const PLATFORM = brandFor(null, '#000000') // brandHex ignored when theme is null

const BRANDS = [
  ['Andina / Verde andino', ANDINA] as const,
  ['Kódigo / Amarillo', KODIGO] as const,
  ['platform (no theme)', PLATFORM] as const,
]

/** Every school template, invoked with a brand and the minimal data it needs. */
function renderAll(brand: SchoolBrand): Record<string, { subject: string; html: string }> {
  return {
    enrollmentConfirmed: enrollmentConfirmedTemplate({
      studentName: 'Ada',
      courseTitle: 'Algebra I',
      schoolName: brand.name,
      dashboardUrl: 'https://school.example.com/dashboard',
      brand,
    }),
    invitation: invitationTemplate({
      schoolName: brand.name,
      inviterName: 'Grace',
      role: 'student',
      joinUrl: 'https://school.example.com/join',
      brand,
    }),
    joinedSchool: joinedSchoolTemplate({
      studentName: 'Ada',
      schoolName: brand.name,
      dashboardUrl: 'https://school.example.com/dashboard',
      brand,
    }),
    certificateIssued: certificateIssuedTemplate({
      studentName: 'Ada',
      courseTitle: 'Algebra I',
      schoolName: brand.name,
      verifyUrl: 'https://school.example.com/verify/abc',
      downloadUrl: 'https://school.example.com/certs/abc.pdf',
      brand,
    }),
    courseRemoved: courseRemovedTemplate({
      courseTitle: 'Algebra I',
      schoolName: brand.name,
      browseUrl: 'https://school.example.com/browse',
      locale: 'en',
      brand,
    }),
    paymentInstructions: paymentInstructionsTemplate({
      schoolName: brand.name,
      itemName: 'Algebra I',
      amountLabel: 'USD 20.00',
      paymentMethod: 'Bank transfer',
      instructions: 'Wire to account 1234',
      requestUrl: 'https://school.example.com/payments/1',
      locale: 'en',
      brand,
    }),
    dailyDigest: dailyDigestEmailTemplate(
      {
        schoolName: brand.name,
        firstName: 'Ada',
        summary: '2 cards due',
        dueCards: 2,
        goalsPending: 1,
        streak: 5,
        actionUrl: 'https://school.example.com/dashboard',
        brand,
      },
      'en'
    ),
    streakNudge: streakNudgeEmailTemplate(
      {
        schoolName: brand.name,
        firstName: 'Ada',
        streak: 7,
        actionUrl: 'https://school.example.com/dashboard',
        brand,
      },
      'en'
    ),
    // Issue #776 — Supabase Auth's own emails (sign-up confirm, magic link,
    // recovery, invite, email-change), rendered by the Send Email hook.
    authOtpSignup: authOtpTemplate({
      kind: 'signup',
      schoolName: brand.name,
      actionUrl: 'https://school.example.com/auth/confirm?token_hash=abc&type=signup&next=%2F',
      locale: 'en',
      brand,
    }),
  }
}

/** `courseRemovedTemplate` renders no `<h2>` — everything else does. */
const TEMPLATES_WITH_HEADING = [
  'enrollmentConfirmed',
  'invitation',
  'joinedSchool',
  'certificateIssued',
  'paymentInstructions',
  'dailyDigest',
  'streakNudge',
  'authOtpSignup',
]

describe.each(BRANDS)('school-branded emails — %s', (_label, brand) => {
  const rendered = renderAll(brand)

  it.each(Object.entries(rendered))('%s uses the brand button colours', (_name, { html }) => {
    expect(html).toContain(brand.outputs.button)
    expect(html).toContain(brand.outputs.buttonInk)
  })

  it.each(Object.entries(rendered).filter(([name]) => TEMPLATES_WITH_HEADING.includes(name)))(
    '%s uses the brand heading colour and font stack',
    (_name, { html }) => {
      expect(html).toContain(brand.outputs.brandText)
      expect(html).toContain(brand.outputs.emailHeadingFontStack)
    }
  )

  it.each(Object.entries(rendered))('%s never carries the old hardcoded blue', (_name, { html }) => {
    expect(html).not.toContain('#2563eb')
  })

  it.each(Object.entries(rendered))('%s never leaks an oklch() or CSS var into mail HTML', (_name, { html }) => {
    expect(html).not.toContain('oklch(')
    expect(html).not.toContain('var(--')
  })
})

describe('schoolLogoHeader', () => {
  it('renders no <img> when the school has no logo', () => {
    const { html } = enrollmentConfirmedTemplate({
      studentName: 'Ada',
      courseTitle: 'Algebra I',
      schoolName: 'Test School',
      dashboardUrl: 'https://school.example.com/dashboard',
      brand: brandFor('andina', '#2F6B4F', null),
    })
    expect(html).not.toContain('<img')
  })

  it('renders an <img> only when a logoUrl is set, escaped for the alt/src attributes', () => {
    const brand = brandFor('andina', '#2F6B4F', 'https://cdn.example.com/logo.png?name="evil"')
    const { html } = enrollmentConfirmedTemplate({
      studentName: 'Ada',
      courseTitle: 'Algebra I',
      schoolName: 'Test School',
      dashboardUrl: 'https://school.example.com/dashboard',
      brand,
    })
    expect(html).toContain('<img')
    // The raw double quote must never reach the attribute unescaped — it would
    // close the attribute early and let anything after it become live markup.
    expect(html).not.toContain('logo.png?name="evil"')
    expect(html).toContain('logo.png?name=&quot;evil&quot;')
  })
})

describe('school name escaping', () => {
  it('HTML-escapes a school name containing markup', () => {
    const brand: SchoolBrand = {
      ...platformSchoolBrand('tenant-2'),
      name: '<b>Evil</b> School',
    }
    const { html } = joinedSchoolTemplate({
      studentName: 'Ada',
      schoolName: brand.name,
      dashboardUrl: 'https://school.example.com/dashboard',
      brand,
    })
    expect(html).not.toContain('<b>Evil</b>')
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;')
  })
})

describe('certificate-issued keeps its neutral secondary button', () => {
  it('does not recolour the "Verify Online" button with the brand', () => {
    const { html } = certificateIssuedTemplate({
      studentName: 'Ada',
      courseTitle: 'Algebra I',
      schoolName: 'Test School',
      verifyUrl: 'https://school.example.com/verify/abc',
      downloadUrl: 'https://school.example.com/certs/abc.pdf',
      brand: KODIGO,
    })
    expect(html).toContain('Verify Online')
    expect(html).toContain('#f3f4f6')
    expect(html).toContain('#1a1a1a')
  })
})

describe('platform billing templates are unaffected by #765', () => {
  const platformTemplates: Array<{ subject: string; html: string }> = [
    accessCutoffWarningTemplate({
      schoolName: 'Test School',
      planName: 'starter',
      reasons: ['12 active students exceed the starter plan\'s limit of 10'],
      cutoffDate: '2026-10-01',
      billingUrl: 'https://school.example.com/billing',
    }),
    downgradeBlockedTemplate({
      schoolName: 'Test School',
      oldPlanName: 'pro',
      newPlanName: 'starter',
      reasons: ['too many courses'],
      outcome: 'reverted',
      billingUrl: 'https://school.example.com/billing',
    }),
    paymentFailedTemplate({
      schoolName: 'Test School',
      planName: 'pro',
      billingUrl: 'https://school.example.com/billing',
    }),
    paymentRequestExpiredTemplate({
      schoolName: 'Test School',
      planName: 'pro',
      amount: 'USD 29.00',
      billingUrl: 'https://school.example.com/billing',
      ttlDays: 7,
    }),
    planDowngradedTemplate({
      schoolName: 'Test School',
      planName: 'pro',
      billingUrl: 'https://school.example.com/billing',
    }),
    renewalReminderTemplate({
      schoolName: 'Test School',
      planName: 'pro',
      billingUrl: 'https://school.example.com/billing',
      periodEnd: '2026-10-01',
      overdue: false,
    }),
  ]

  it.each(platformTemplates.map((t, i) => [i, t] as const))(
    'template %i keeps the "LMS Platform Billing" footer and no school-brand values',
    (_i, { html }) => {
      expect(html).toContain('LMS Platform Billing')
      for (const brand of [ANDINA, KODIGO]) {
        expect(html).not.toContain(brand.outputs.button)
        expect(html).not.toContain(brand.outputs.brandText)
        expect(html).not.toContain(brand.outputs.emailHeadingFontStack)
      }
    }
  )
})
