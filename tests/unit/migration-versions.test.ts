import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('gives every Supabase migration a unique version', () => {
  const files = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
  const versions = new Map<string, string[]>()
  for (const file of files) {
    const version = file.split('_')[0]
    versions.set(version, [...(versions.get(version) ?? []), file])
  }
  const collisions = [...versions.values()].filter((files) => files.length > 1)
  expect(collisions, 'Duplicate versions prevent Supabase startup before E2E tests run').toEqual([])
})
