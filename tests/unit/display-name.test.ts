/**
 * Signup stopped requiring a full name (#790), so `profiles.full_name` is now
 * filled from the address when the field is left empty. The property these
 * tests pin is that the fallback is always *something* — an empty name is what
 * renders as "Unknown Student" on every teacher and admin list.
 */

import { describe, expect, it } from 'vitest'
import { deriveNameFromEmail } from '@/lib/auth/display-name'

describe('deriveNameFromEmail', () => {
  it('title-cases the words in the local part', () => {
    expect(deriveNameFromEmail('ada.lovelace@example.com')).toBe('Ada Lovelace')
    expect(deriveNameFromEmail('ada_lovelace@example.com')).toBe('Ada Lovelace')
    expect(deriveNameFromEmail('ada-lovelace@example.com')).toBe('Ada Lovelace')
    expect(deriveNameFromEmail('ada+courses@example.com')).toBe('Ada Courses')
  })

  it('drops the digits people append to an address', () => {
    expect(deriveNameFromEmail('ada.lovelace99@example.com')).toBe('Ada Lovelace')
    expect(deriveNameFromEmail('ada2lovelace@example.com')).toBe('Ada Lovelace')
  })

  it('keeps accented and non-latin names intact', () => {
    expect(deriveNameFromEmail('josé.martínez@example.com')).toBe('José Martínez')
    expect(deriveNameFromEmail('María@example.com')).toBe('María')
  })

  it('falls back to the local part when there is no word in it', () => {
    expect(deriveNameFromEmail('42@example.com')).toBe('42')
    expect(deriveNameFromEmail('___@example.com')).toBe('___')
  })

  it('never returns a name for an address that has no local part', () => {
    expect(deriveNameFromEmail('')).toBe('')
    expect(deriveNameFromEmail('   ')).toBe('')
    expect(deriveNameFromEmail('@example.com')).toBe('')
  })

  it('is not confused by a trailing space or an uppercase address', () => {
    expect(deriveNameFromEmail('  ada.lovelace@example.com  ')).toBe('Ada Lovelace')
    expect(deriveNameFromEmail('ADA@example.com')).toBe('ADA')
  })
})
