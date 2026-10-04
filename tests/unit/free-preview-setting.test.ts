import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression for issue #799: `isFreePreviewEnabled()` gates every
 * admin-client read of preview lessons (the sitemap, the public course page,
 * the public lesson-preview page). It must default to ON — a tenant with no
 * `free_preview_enabled` row, or a row with no `enabled` key, is what every
 * school looks like today, and this helper must not silently take preview
 * access away from all of them the day it ships.
 */

const state: { row: { setting_value: unknown } | null } = { row: null }

function makeFakeAdmin() {
  const b: Record<string, unknown> = {
    from() { return b },
    select() { return b },
    eq() { return b },
    maybeSingle() { return Promise.resolve({ data: state.row, error: null }) },
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeFakeAdmin(),
}))

import { isFreePreviewEnabled, FREE_PREVIEW_SETTING_KEY } from '@/lib/settings/free-preview'

beforeEach(() => { state.row = null })

describe('isFreePreviewEnabled (#799)', () => {
  it('defaults to true when the tenant has no setting row', async () => {
    state.row = null
    expect(await isFreePreviewEnabled('tenant-no-row')).toBe(true)
  })

  it('defaults to true when the row has no `enabled` key', async () => {
    state.row = { setting_value: {} }
    expect(await isFreePreviewEnabled('tenant-empty-value')).toBe(true)
  })

  it('is true when explicitly enabled', async () => {
    state.row = { setting_value: { enabled: true } }
    expect(await isFreePreviewEnabled('tenant-on')).toBe(true)
  })

  it('is false only when explicitly disabled', async () => {
    state.row = { setting_value: { enabled: false } }
    expect(await isFreePreviewEnabled('tenant-off')).toBe(false)
  })

  it('uses the documented setting key', () => {
    expect(FREE_PREVIEW_SETTING_KEY).toBe('free_preview_enabled')
  })
})
