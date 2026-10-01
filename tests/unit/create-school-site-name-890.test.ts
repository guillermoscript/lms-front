import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'supabase/migrations/20261001160000_create_school_site_name_890.sql'),
  'utf8',
)
const form = readFileSync(join(root, 'components/admin/general-settings-form.tsx'), 'utf8')

describe('#890 create_school seeds site_name', () => {
  it('inserts site_name from _name, idempotently, inside create_school', () => {
    const fn = migration.slice(0, migration.indexOf('ALTER TABLE'))
    expect(fn).toMatch(/CREATE OR REPLACE FUNCTION public\.create_school/)
    expect(fn).toMatch(
      /'site_name', jsonb_build_object\('value', _name\)\)\s*ON CONFLICT \(tenant_id, setting_key\) DO NOTHING/,
    )
  })

  it('backfills existing tenants with user triggers disabled', () => {
    expect(migration).toMatch(
      /DISABLE TRIGGER USER[\s\S]*FROM public\.tenants[\s\S]*ON CONFLICT[\s\S]*ENABLE TRIGGER USER/,
    )
  })

  it('General form no longer requires the unseeded email fields', () => {
    for (const id of ['contact_email', 'support_email']) {
      const start = form.indexOf(`name="${id}"`)
      const block = form.slice(start, form.indexOf('/>', start))
      expect(block).not.toMatch(/\brequired\b/)
    }
  })
})
