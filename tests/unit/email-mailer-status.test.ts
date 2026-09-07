import { describe, it, expect } from 'vitest'
import { isMailerConfigured, getMailerStatus } from '@/lib/email/status'
import { courseRemovedTemplate, resolveCourseRemovedLocale } from '@/lib/email/templates/course-removed'

/**
 * Issue #676 — surface mailer configuration state (no secret values) and
 * verify the course-removed email template's locale + escaping behavior.
 */

describe('isMailerConfigured', () => {
  it('is false when MAILGUN_API_KEY is missing', () => {
    expect(isMailerConfigured({ MAILGUN_DOMAIN: 'mg.example.com' })).toBe(false)
  })

  it('is false when MAILGUN_DOMAIN is missing', () => {
    expect(isMailerConfigured({ MAILGUN_API_KEY: 'key-123' })).toBe(false)
  })

  it('is true when both are present', () => {
    expect(
      isMailerConfigured({ MAILGUN_API_KEY: 'key-123', MAILGUN_DOMAIN: 'mg.example.com' })
    ).toBe(true)
  })
})

describe('getMailerStatus', () => {
  it('reports unconfigured with null domain/from', () => {
    expect(getMailerStatus({})).toEqual({ configured: false, domain: null, from: null })
  })

  it('defaults from to noreply@<domain> when EMAIL_FROM is not set', () => {
    const status = getMailerStatus({ MAILGUN_API_KEY: 'key-123', MAILGUN_DOMAIN: 'mg.example.com' })

    expect(status).toEqual({
      configured: true,
      domain: 'mg.example.com',
      from: 'noreply@mg.example.com',
    })
  })

  it('uses EMAIL_FROM when set', () => {
    const status = getMailerStatus({
      MAILGUN_API_KEY: 'key-123',
      MAILGUN_DOMAIN: 'mg.example.com',
      EMAIL_FROM: 'hello@school.com',
    })

    expect(status.from).toBe('hello@school.com')
  })

  it('never leaks the API key value', () => {
    const secret = 'super-secret-mailgun-key'
    const status = getMailerStatus({
      MAILGUN_API_KEY: secret,
      MAILGUN_DOMAIN: 'mg.example.com',
      EMAIL_FROM: 'hello@school.com',
    })

    expect(JSON.stringify(status)).not.toContain(secret)
  })
})

describe('resolveCourseRemovedLocale', () => {
  it.each([
    ['es', 'es'],
    ['es-MX', 'es'],
    ['en', 'en'],
    [undefined, 'en'],
    [null, 'en'],
    ['fr', 'en'],
  ] as const)('resolves %s to %s', (input, expected) => {
    expect(resolveCourseRemovedLocale(input)).toBe(expected)
  })
})

describe('courseRemovedTemplate', () => {
  const base = {
    courseTitle: 'Intro to Algebra',
    schoolName: 'Test School',
    browseUrl: 'https://school.example.com/dashboard/student/browse',
  }

  it('produces English copy with the course title and school in the subject', () => {
    const { subject } = courseRemovedTemplate({ ...base, locale: 'en' })

    expect(subject).toContain(base.courseTitle)
    expect(subject).toContain(base.schoolName)
  })

  it('produces Spanish copy for es locale', () => {
    const { subject } = courseRemovedTemplate({ ...base, locale: 'es' })

    expect(subject).toContain('fue eliminado')
  })

  it('escapes HTML in courseTitle', () => {
    const { html } = courseRemovedTemplate({
      ...base,
      courseTitle: '<script>alert(1)</script>',
      locale: 'en',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes the browseUrl', () => {
    const { html } = courseRemovedTemplate({ ...base, locale: 'en' })

    expect(html).toContain(base.browseUrl)
  })
})
