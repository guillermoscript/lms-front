/**
 * `toAuthFailureCode` is a privacy boundary, not a formatting helper.
 *
 * `login_failed`, `signup_failed` and `auth_error_shown` all pass provider
 * error text through it before it reaches OpenPanel. GoTrue messages are not a
 * fixed vocabulary and some interpolate the submitted address, so the property
 * these tests actually pin is: **whatever goes in, what comes out is a member
 * of a small closed set and contains none of the input.**
 *
 * The second property is account enumeration — "user not found" and "invalid
 * password" must be indistinguishable downstream.
 */

import { describe, expect, it } from 'vitest'
import {
  type AuthFailureCode,
  toAuthFailureCode,
} from '@/lib/analytics/auth-failure-codes'

const ALLOWED: ReadonlySet<AuthFailureCode> = new Set<AuthFailureCode>([
  'invalid_credentials',
  'email_not_confirmed',
  'email_taken',
  'weak_password',
  'rate_limited',
  'name_required',
  'expired_or_invalid_link',
  'missing_token',
  'provider_error',
  'network_error',
  'unknown',
])

describe('toAuthFailureCode', () => {
  it('never returns anything outside the closed set', () => {
    const inputs: unknown[] = [
      new Error('Invalid login credentials'),
      new Error('Email not confirmed'),
      new Error('User already registered'),
      new Error('Password should be at least 6 characters'),
      new Error('Email rate limit exceeded'),
      new Error('Token has expired or is invalid'),
      'No token hash or type',
      'Could not authenticate with provider',
      new Error('fetch failed'),
      new Error('something nobody has ever seen'),
      '',
      '   ',
      null,
      undefined,
      42,
      { message: 'not an error' },
      [],
    ]

    for (const input of inputs) {
      expect(ALLOWED.has(toAuthFailureCode(input))).toBe(true)
    }
  })

  it('does not leak the submitted email address', () => {
    // The shape that motivated this module: a provider string carrying PII.
    const leaky = new Error(
      'A user with this email address (student@example.com) has already been registered'
    )
    const code = toAuthFailureCode(leaky)

    expect(code).toBe('email_taken')
    expect(code).not.toContain('@')
    expect(code).not.toContain('example.com')
  })

  it('collapses both enumeration branches to one code', () => {
    // If these ever differ, a dashboard tells an attacker which addresses exist.
    expect(toAuthFailureCode(new Error('Invalid login credentials'))).toBe('invalid_credentials')
    expect(toAuthFailureCode(new Error('User not found'))).toBe('invalid_credentials')
  })

  it('does not mistake a rejected password for a weak one', () => {
    // Ordering regression: a bare 'password' needle would catch this and report
    // a weak-password rejection for someone who simply typed the wrong one.
    expect(toAuthFailureCode(new Error('Invalid email or password'))).toBe('invalid_credentials')
    expect(toAuthFailureCode(new Error('Password should be at least 6 characters'))).toBe(
      'weak_password'
    )
  })

  it('decodes query-parameter encoding before matching', () => {
    // `/auth/error?error=` is built by redirecting a raw GoTrue message, so it
    // arrives `+`-encoded. Without normalisation every needle would miss and
    // the whole event would flatten to `unknown`.
    expect(toAuthFailureCode('Could+not+authenticate+with+provider')).toBe('provider_error')
    expect(toAuthFailureCode('No+token+hash+or+type')).toBe('missing_token')
  })

  it('treats absent input as unknown rather than throwing', () => {
    expect(toAuthFailureCode(undefined)).toBe('unknown')
    expect(toAuthFailureCode('')).toBe('unknown')
  })
})
