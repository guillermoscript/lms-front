import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Issue #763 — the only writer of a school's theme. Themes and their six
 * recommended swatches are open to every plan; a custom hex needs
 * `custom_branding`; a reset is always allowed. The plan lookup is stubbed at
 * `requirePlanFeature` (keeping the real `PlanFeatureError` and message), and
 * `tenant_settings` is a small in-memory table that honours the composite
 * conflict key and every `eq` filter, so a write that forgot its tenant filter
 * would visibly touch another school's row.
 */

type Row = Record<string, unknown>

const state: {
  role: string | null
  tenantId: string
  customBranding: boolean
  rows: Row[]
  upserts: { values: Row; onConflict?: string }[]
  planChecks: { tenantId: string; feature: string }[]
  writeError: { code: string; message: string } | null
} = {
  role: 'admin',
  tenantId: 't1',
  customBranding: false,
  rows: [],
  upserts: [],
  planChecks: [],
  writeError: null,
}

function fakeAdminClient() {
  return {
    from(table: string) {
      if (table !== 'tenant_settings') throw new Error(`theme actions should only touch tenant_settings, not ${table}`)
      const filters: [string, unknown][] = []
      let op: 'select' | 'delete' | null = null
      const matches = (row: Row) => filters.every(([col, value]) => row[col] === value)

      const b: Record<string, unknown> = {
        select() {
          op = 'select'
          return b
        },
        delete() {
          op = 'delete'
          return b
        },
        eq(col: string, value: unknown) {
          filters.push([col, value])
          return b
        },
        upsert(values: Row, opts?: { onConflict?: string }) {
          state.upserts.push({ values, onConflict: opts?.onConflict })
          if (state.writeError) return Promise.resolve({ data: null, error: state.writeError })
          const keys = (opts?.onConflict ?? '').split(',').filter(Boolean)
          if (keys.length === 0) throw new Error('upsert without onConflict would insert a duplicate row')
          const existing = state.rows.find((row) => keys.every((key) => row[key] === values[key]))
          if (existing) Object.assign(existing, values)
          else state.rows.push({ ...values })
          return Promise.resolve({ data: null, error: null })
        },
        maybeSingle() {
          const rows = state.rows.filter(matches)
          if (rows.length > 1) {
            return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'more than one row returned' } })
          }
          return Promise.resolve({ data: rows[0] ?? null, error: null })
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (op === 'delete') {
            if (state.writeError) return Promise.resolve({ data: null, error: state.writeError }).then(resolve, reject)
            state.rows = state.rows.filter((row) => !matches(row))
            return Promise.resolve({ data: null, error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: state.rows.filter(matches), error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(state.tenantId),
  getCurrentUserId: () => Promise.resolve('user-1'),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve(state.role) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdminClient() }))
vi.mock('@/lib/plans/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/plans/server')>()
  const { FEATURE_REQUIRED_PLAN } = await import('@/lib/plans/features')
  return {
    ...actual,
    requirePlanFeature: async (tenantId: string, feature: import('@/lib/plans/server').PlanFeatureKey) => {
      state.planChecks.push({ tenantId, feature })
      const included = feature === 'custom_branding' && state.customBranding
      if (!included) throw new actual.PlanFeatureError(feature, 'free', FEATURE_REQUIRED_PLAN[feature] ?? 'starter')
      return { slug: 'business', name: 'Business', features: { [feature]: true } }
    },
  }
})
vi.mock('@/lib/analytics/server', () => ({
  track: vi.fn(() => Promise.resolve()),
  safeAnalytics: async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch {
      // Mirrors the real helper: analytics never fails the action.
    }
  },
}))

import { revalidatePath } from 'next/cache'
import { track } from '@/lib/analytics/server'
import { applyKitTheme, getSchoolTheme, resetSchoolTheme } from '@/app/actions/admin/theme'
import { KIT_THEME_IDS, KIT_THEMES } from '@/lib/themes/kit'

const KEY = 'theme_preset'
const OTHER_TENANT_ROW: Row = {
  tenant_id: 't2',
  setting_key: KEY,
  setting_value: { type: 'kit', theme: 'kodigo', brand: '#F2B705' },
}

const rowsFor = (tenantId: string) => state.rows.filter((row) => row.tenant_id === tenantId)
const themeRowFor = (tenantId: string) => rowsFor(tenantId).find((row) => row.setting_key === KEY)

beforeEach(() => {
  state.role = 'admin'
  state.tenantId = 't1'
  state.customBranding = false
  state.rows = [structuredClone(OTHER_TENANT_ROW)]
  state.upserts = []
  state.planChecks = []
  state.writeError = null
  vi.clearAllMocks()
})

describe('applyKitTheme', () => {
  it('refuses anyone who is not the school admin, before touching anything', async () => {
    for (const role of ['teacher', 'student', null]) {
      state.role = role
      const result = await applyKitTheme({ theme: 'andina', brand: '#9A3F2C' })
      expect(result, String(role)).toEqual({ success: false, error: 'Unauthorized' })
    }
    expect(state.upserts).toEqual([])
    expect(state.planChecks).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an unknown theme or a colour that is not #RRGGBB, whatever the plan', async () => {
    state.customBranding = true
    const invalid = [
      { theme: 'Andina', brand: '#9A3F2C' },
      { theme: 'nope', brand: '#9A3F2C' },
      { theme: 'curated', brand: '#9A3F2C' },
      { theme: 42, brand: '#9A3F2C' },
      { theme: 'andina', brand: '#9A3F2' },
      { theme: 'andina', brand: '#fff' },
      { theme: 'andina', brand: 'red' },
      { theme: 'andina', brand: 'oklch(0.5 0.1 30)' },
      { theme: 'andina' },
      {},
      null,
    ]
    for (const input of invalid) {
      const result = await applyKitTheme(input as never)
      expect(result, JSON.stringify(input)).toEqual({ success: false, error: 'Invalid theme or colour' })
    }
    expect(state.upserts).toEqual([])
    expect(state.planChecks).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('saves a recommended swatch on a plan without custom_branding', async () => {
    const result = await applyKitTheme({ theme: 'andina', brand: '#9a3f2c' })

    const saved = { type: 'kit', theme: 'andina', brand: '#9A3F2C' }
    expect(result).toEqual({ success: true, data: saved })
    expect(rowsFor('t1')).toEqual([{ tenant_id: 't1', setting_key: KEY, setting_value: saved }])
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0].onConflict).toBe('tenant_id,setting_key')
    // A swatch never asks for the plan.
    expect(state.planChecks).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(track).toHaveBeenCalledWith(
      'theme_customized',
      { theme: 'andina', custom: false, change: 'theme' },
      expect.objectContaining({ tenantId: 't1' }),
    )
    // Another school's row is untouched.
    expect(themeRowFor('t2')).toEqual(OTHER_TENANT_ROW)
  })

  it('accepts every theme with every one of its swatches on a plan without custom_branding', async () => {
    for (const id of KIT_THEME_IDS) {
      for (const { hex } of KIT_THEMES[id].swatches) {
        const result = await applyKitTheme({ theme: id, brand: hex })
        expect(result.success, `${id} ${hex}`).toBe(true)
        expect(themeRowFor('t1')?.setting_value, `${id} ${hex}`).toEqual({ type: 'kit', theme: id, brand: hex })
      }
    }
    // One row per school, overwritten in place.
    expect(rowsFor('t1')).toHaveLength(1)
    expect(state.planChecks).toEqual([])
  })

  it('refuses a custom colour without custom_branding and writes nothing', async () => {
    state.rows.push({ tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'luz', brand: '#C2185B' } })

    for (const input of [
      { theme: 'luz', brand: '#E53935' },
      // Another theme's swatch is a custom colour for this one.
      { theme: 'andina', brand: '#3A50B8' },
    ]) {
      const result = await applyKitTheme(input)
      expect(result.success, JSON.stringify(input)).toBe(false)
      expect(result.error).toBe('This feature requires the Business plan or higher. Upgrade your plan to unlock it.')
    }

    expect(state.planChecks).toEqual([
      { tenantId: 't1', feature: 'custom_branding' },
      { tenantId: 't1', feature: 'custom_branding' },
    ])
    expect(state.upserts).toEqual([])
    expect(themeRowFor('t1')?.setting_value).toEqual({ type: 'kit', theme: 'luz', brand: '#C2185B' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('saves a custom colour with custom_branding', async () => {
    state.customBranding = true
    const result = await applyKitTheme({ theme: 'luz', brand: ' #e53935 ' })

    const saved = { type: 'kit', theme: 'luz', brand: '#E53935' }
    expect(result).toEqual({ success: true, data: saved })
    expect(state.planChecks).toEqual([{ tenantId: 't1', feature: 'custom_branding' }])
    expect(themeRowFor('t1')?.setting_value).toEqual(saved)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(track).toHaveBeenCalledWith(
      'theme_customized',
      { theme: 'luz', custom: true, change: 'theme' },
      expect.objectContaining({ tenantId: 't1' }),
    )
  })

  it('reports a failed write and does not revalidate', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.writeError = { code: '42501', message: 'permission denied' }

    const result = await applyKitTheme({ theme: 'andina', brand: '#9A3F2C' })

    expect(result).toEqual({ success: false, error: 'Failed to save theme' })
    expect(themeRowFor('t1')).toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('resetSchoolTheme', () => {
  it("deletes only this school's theme row, on a plan without custom_branding", async () => {
    state.rows.push(
      { tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'luz', brand: '#E53935' } },
      { tenant_id: 't1', setting_key: 'logo_url', setting_value: { value: 'https://example.com/logo.png' } },
    )

    const result = await resetSchoolTheme()

    expect(result).toEqual({ success: true, data: null })
    expect(themeRowFor('t1')).toBeUndefined()
    expect(rowsFor('t1')).toEqual([
      { tenant_id: 't1', setting_key: 'logo_url', setting_value: { value: 'https://example.com/logo.png' } },
    ])
    expect(themeRowFor('t2')).toEqual(OTHER_TENANT_ROW)
    expect(state.planChecks).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(track).toHaveBeenCalledWith(
      'theme_customized',
      { theme: null, custom: false, change: 'reset' },
      expect.objectContaining({ tenantId: 't1' }),
    )
  })

  it('succeeds when nothing is stored', async () => {
    expect(await resetSchoolTheme()).toEqual({ success: true, data: null })
    expect(themeRowFor('t2')).toEqual(OTHER_TENANT_ROW)
  })

  it('refuses anyone who is not the school admin', async () => {
    state.rows.push({ tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'luz', brand: '#C2185B' } })
    for (const role of ['teacher', 'student', null]) {
      state.role = role
      expect(await resetSchoolTheme(), String(role)).toEqual({ success: false, error: 'Unauthorized' })
    }
    expect(themeRowFor('t1')).toBeDefined()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a failed delete and does not revalidate', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rows.push({ tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'luz', brand: '#C2185B' } })
    state.writeError = { code: '42501', message: 'permission denied' }

    expect(await resetSchoolTheme()).toEqual({ success: false, error: 'Failed to reset theme' })
    expect(themeRowFor('t1')).toBeDefined()
    expect(revalidatePath).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('getSchoolTheme', () => {
  it("returns this school's stored theme, not another school's", async () => {
    expect(await getSchoolTheme()).toBeNull()

    state.rows.push({ tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'andina', brand: '#9a3f2c' } })
    expect(await getSchoolTheme()).toEqual({ type: 'kit', theme: 'andina', brand: '#9A3F2C' })
  })

  it('returns what was saved, not the plan-resolved theme', async () => {
    state.customBranding = false
    state.rows.push({ tenant_id: 't1', setting_key: KEY, setting_value: { type: 'kit', theme: 'luz', brand: '#E53935' } })
    expect(await getSchoolTheme()).toEqual({ type: 'kit', theme: 'luz', brand: '#E53935' })
  })

  it('returns null for malformed jsonb', async () => {
    const malformed: unknown[] = [
      null,
      'andina',
      42,
      [],
      { type: 'curated', id: 'default' },
      { type: 'custom', id: 'custom-x', variables: { light: {}, dark: {} } },
      { type: 'kit', theme: 'andina' },
      { type: 'kit', theme: 'Andina', brand: '#9A3F2C' },
      { type: 'kit', theme: 'andina', brand: '#fff' },
      { type: 'kit', theme: 'andina', brand: 'red' },
    ]
    for (const value of malformed) {
      state.rows = [structuredClone(OTHER_TENANT_ROW), { tenant_id: 't1', setting_key: KEY, setting_value: value }]
      expect(await getSchoolTheme(), JSON.stringify(value)).toBeNull()
    }
  })
})
