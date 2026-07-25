import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'

/**
 * `/platform` was English-only until the payouts page moved onto next-intl
 * (#516). A key present in `en` but missing from `es` doesn't throw — next-intl
 * falls back and the operator sees English inside a Spanish page — so parity is
 * asserted here instead of being noticed in production.
 *
 * Scoped to the `platform` namespace on purpose: the rest of the catalogue has
 * pre-existing drift, and a global assertion would fail for reasons that have
 * nothing to do with the page under test. Widen it when that drift is cleaned up.
 */
function leafKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('platform message catalogue', () => {
  const enKeys = leafKeys(en.platform, 'platform')
  const esKeys = leafKeys(es.platform, 'platform')

  it('has the same keys in English and Spanish', () => {
    expect([...esKeys].sort()).toEqual([...enKeys].sort())
  })

  it('has no empty or untranslated-placeholder strings', () => {
    const flat = (obj: unknown, prefix = ''): [string, string][] =>
      obj !== null && typeof obj === 'object'
        ? Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
            flat(v, prefix ? `${prefix}.${k}` : k),
          )
        : [[prefix, String(obj)]]

    for (const [key, value] of [...flat(en.platform, 'platform'), ...flat(es.platform, 'platform')]) {
      expect(value.trim(), key).not.toBe('')
      expect(value, key).not.toMatch(/^TODO/i)
    }
  })

  it('keeps the ICU placeholders of each English string in its Spanish counterpart', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
    const byKey = (obj: unknown, prefix = ''): Record<string, string> =>
      obj !== null && typeof obj === 'object'
        ? Object.assign(
            {},
            ...Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
              byKey(v, prefix ? `${prefix}.${k}` : k),
            ),
          )
        : { [prefix]: String(obj) }

    const enFlat = byKey(en.platform, 'platform')
    const esFlat = byKey(es.platform, 'platform')
    for (const [key, value] of Object.entries(enFlat)) {
      expect(placeholders(esFlat[key] ?? ''), key).toEqual(placeholders(value))
    }
  })
})
