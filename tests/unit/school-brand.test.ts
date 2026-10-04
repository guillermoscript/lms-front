import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the orchestrator's contract module `lib/themes/school-brand.ts`
 * (issue #765, epic #766). This file only asserts the contract; it never edits
 * `school-brand.ts` — a failure here is a bug in that module, reported to the
 * orchestrator by test name.
 *
 * `getSchoolBrand` is wrapped in React `cache()`, which memoises per tenant id
 * within a render/request. That memoisation survives across `it()` blocks in
 * this file (there is no per-test request boundary to reset it), so every case
 * below uses its own tenant id rather than relying on `beforeEach` to reset
 * state for a shared one.
 */

type TenantRow = { name: string | null; logo_url: string | null } | null
type SettingRow = { setting_key: string; setting_value: unknown }

const state: {
  tenants: Map<string, TenantRow>
  settings: Map<string, SettingRow[]>
  customBranding: Map<string, boolean>
  errorTenant: Set<string>
  errorSettings: Set<string>
} = {
  tenants: new Map(),
  settings: new Map(),
  customBranding: new Map(),
  errorTenant: new Set(),
  errorSettings: new Set(),
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              if (table === 'tenants') {
                return {
                  maybeSingle: async () => {
                    if (state.errorTenant.has(value)) {
                      return { data: null, error: new Error('tenants read failed') }
                    }
                    return { data: state.tenants.get(value) ?? null, error: null }
                  },
                }
              }
              if (table === 'tenant_settings') {
                return {
                  in: async () => {
                    if (state.errorSettings.has(value)) {
                      return { data: null, error: new Error('tenant_settings read failed') }
                    }
                    return { data: state.settings.get(value) ?? [], error: null }
                  },
                }
              }
              throw new Error(`school-brand.test: unexpected table ${table}`)
            },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeFakeAdmin(),
}))
vi.mock('@/lib/plans/server', () => ({
  hasPlanFeature: (tenantId: string) => Promise.resolve(state.customBranding.get(tenantId) ?? false),
}))

import { getSchoolBrand } from '@/lib/themes/school-brand'
import { deriveBrandOutputs } from '@/lib/themes/brand-outputs'
import { SCHOOL_THEME_SETTING_KEY, KIT_THEMES } from '@/lib/themes/kit'

beforeEach(() => {
  state.tenants.clear()
  state.settings.clear()
  state.customBranding.clear()
  state.errorTenant.clear()
  state.errorSettings.clear()
})

function settingValue(text: string) {
  return { value: text }
}

describe('getSchoolBrand', () => {
  it('site_name and logo_url settings override tenants.name and tenants.logo_url', async () => {
    const tenantId = 'tenant-settings-override'
    state.tenants.set(tenantId, { name: 'Tenant Column Name', logo_url: 'https://tenants-column.example.com/logo.png' })
    state.settings.set(tenantId, [
      { setting_key: 'site_name', setting_value: settingValue('Setting Name') },
      { setting_key: 'logo_url', setting_value: settingValue('https://setting.example.com/logo.png') },
    ])

    const brand = await getSchoolBrand(tenantId)

    expect(brand.name).toBe('Setting Name')
    expect(brand.logoUrl).toBe('https://setting.example.com/logo.png')
  })

  it('falls back to tenants columns when settings are absent', async () => {
    const tenantId = 'tenant-columns-only'
    state.tenants.set(tenantId, { name: 'Column Name', logo_url: 'https://tenants-column.example.com/logo.png' })
    state.settings.set(tenantId, [])

    const brand = await getSchoolBrand(tenantId)

    expect(brand.name).toBe('Column Name')
    expect(brand.logoUrl).toBe('https://tenants-column.example.com/logo.png')
  })

  it('turns a non-http logo into null', async () => {
    const tenantId = 'tenant-bad-logo'
    state.tenants.set(tenantId, { name: 'Bad Logo School', logo_url: 'javascript:alert(1)' })
    state.settings.set(tenantId, [])

    const brand = await getSchoolBrand(tenantId)

    expect(brand.logoUrl).toBeNull()
  })

  it('an off-swatch brand with customBranding false resolves to the theme\'s first swatch', async () => {
    const tenantId = 'tenant-theme-no-custom'
    state.tenants.set(tenantId, { name: 'No Custom Branding School', logo_url: null })
    state.settings.set(tenantId, [
      {
        setting_key: SCHOOL_THEME_SETTING_KEY,
        setting_value: { type: 'kit', theme: 'andina', brand: '#123456' },
      },
    ])
    state.customBranding.set(tenantId, false)

    const brand = await getSchoolBrand(tenantId)

    const expectedSwatch = KIT_THEMES.andina.swatches[0].hex
    expect(brand.theme).toEqual({ type: 'kit', theme: 'andina', brand: expectedSwatch })
    expect(brand.outputs).toEqual(deriveBrandOutputs({ type: 'kit', theme: 'andina', brand: expectedSwatch }))
  })

  it('an off-swatch brand with customBranding true keeps the custom colour', async () => {
    const tenantId = 'tenant-theme-with-custom'
    state.tenants.set(tenantId, { name: 'Custom Branding School', logo_url: null })
    state.settings.set(tenantId, [
      {
        setting_key: SCHOOL_THEME_SETTING_KEY,
        setting_value: { type: 'kit', theme: 'andina', brand: '#123456' },
      },
    ])
    state.customBranding.set(tenantId, true)

    const brand = await getSchoolBrand(tenantId)

    expect(brand.theme).toEqual({ type: 'kit', theme: 'andina', brand: '#123456' })
    expect(brand.outputs).toEqual(deriveBrandOutputs({ type: 'kit', theme: 'andina', brand: '#123456' }))
  })

  it('no theme row means theme is null and outputs are the platform palette', async () => {
    const tenantId = 'tenant-no-theme'
    state.tenants.set(tenantId, { name: 'No Theme School', logo_url: null })
    state.settings.set(tenantId, [])

    const brand = await getSchoolBrand(tenantId)

    expect(brand.theme).toBeNull()
    expect(brand.outputs).toEqual(deriveBrandOutputs(null))
  })

  it('a DB error falls back to the platform palette without throwing', async () => {
    const tenantId = 'tenant-db-error'
    state.errorTenant.add(tenantId)

    await expect(getSchoolBrand(tenantId)).resolves.toEqual({
      tenantId,
      name: '',
      logoUrl: null,
      theme: null,
      outputs: deriveBrandOutputs(null),
    })
  })

  it('a tenant_settings read error also falls back to the platform palette without throwing', async () => {
    const tenantId = 'tenant-settings-error'
    state.tenants.set(tenantId, { name: 'Settings Error School', logo_url: null })
    state.errorSettings.add(tenantId)

    await expect(getSchoolBrand(tenantId)).resolves.toEqual({
      tenantId,
      name: '',
      logoUrl: null,
      theme: null,
      outputs: deriveBrandOutputs(null),
    })
  })
})
