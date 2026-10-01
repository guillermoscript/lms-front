import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * #890 — a school made by create_school() has no site_name / emails. The
 * General form must save untouched: the name defaults to tenants.name (display
 * only), the emails are optional, validated when present, stored as null.
 */

const state: { upserts: Array<Record<string, unknown>[]> } = { upserts: [] }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve('t1'),
  getCurrentUserId: () => Promise.resolve('u1'),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve('admin') }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        state.upserts.push(rows)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { updateSettings } from '@/app/actions/admin/settings'
import { defaultSiteName, normalizeOptionalEmail } from '@/lib/settings/general-settings'

beforeEach(() => {
  state.upserts = []
})

const untouched = {
  site_name: { value: 'Acme School' },
  site_description: { value: '' },
  contact_email: { value: '' },
  support_email: { value: '' },
  timezone: { value: 'America/New_York' },
  maintenance_mode: { enabled: false, message: '' },
}

function stored(key: string) {
  const row = state.upserts.flat().find((r) => r.setting_key === key)
  return row?.setting_value as { value?: unknown } | undefined
}

describe('updateSettings (General form payload)', () => {
  it('saves an untouched form: blank emails become null, not ""', async () => {
    const r = await updateSettings(untouched)
    expect(r.success).toBe(true)
    expect(stored('contact_email')).toEqual({ value: null })
    expect(stored('support_email')).toEqual({ value: null })
    expect(stored('site_name')).toEqual({ value: 'Acme School' })
  })

  it('trims and keeps a valid email', async () => {
    const r = await updateSettings({ ...untouched, contact_email: { value: '  hi@acme.org ' } })
    expect(r.success).toBe(true)
    expect(stored('contact_email')).toEqual({ value: 'hi@acme.org' })
  })

  it('rejects a malformed email and writes nothing', async () => {
    const r = await updateSettings({ ...untouched, support_email: { value: 'not-an-email' } })
    expect(r).toEqual({ success: false, error: 'invalid_email' })
    expect(state.upserts).toHaveLength(0)
  })

  it('does not touch settings that carry no email key', async () => {
    const r = await updateSettings({ timezone: { value: 'UTC' } })
    expect(r.success).toBe(true)
    expect(state.upserts[0]).toHaveLength(1)
  })
})

describe('form defaults', () => {
  it('site name falls back to the tenant name while unset, never overrides a saved one', () => {
    expect(defaultSiteName(undefined, 'Acme School')).toBe('Acme School')
    expect(defaultSiteName('  ', 'Acme School')).toBe('Acme School')
    expect(defaultSiteName('Saved Name', 'Acme School')).toBe('Saved Name')
    expect(defaultSiteName(undefined, null)).toBe('')
  })

  it('normalizeOptionalEmail', () => {
    expect(normalizeOptionalEmail('')).toEqual({ ok: true, value: null })
    expect(normalizeOptionalEmail(null)).toEqual({ ok: true, value: null })
    expect(normalizeOptionalEmail('a@b.co')).toEqual({ ok: true, value: 'a@b.co' })
    expect(normalizeOptionalEmail('a@b')).toEqual({ ok: false })
  })
})
