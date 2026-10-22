import { describe, expect, it } from 'vitest'

import { errorMessage } from '@/lib/supabase/error-message'

describe('errorMessage', () => {
  it('uses an Error message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('surfaces a plain PostgrestError object with its code', () => {
    const pgErr = {
      message: "Could not find the table 'public.tenant_assets' in the schema cache",
      code: 'PGRST205',
      details: null,
      hint: null,
    }
    expect(errorMessage(pgErr, 'fallback')).toBe(
      "Could not find the table 'public.tenant_assets' in the schema cache (PGRST205)"
    )
  })

  it('omits an empty code', () => {
    expect(errorMessage({ message: 'permission denied', code: '' }, 'fallback')).toBe('permission denied')
  })

  it('falls back for anything without a message', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage('oops', 'fallback')).toBe('fallback')
    expect(errorMessage({ code: '42P01' }, 'fallback')).toBe('fallback')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
  })
})
