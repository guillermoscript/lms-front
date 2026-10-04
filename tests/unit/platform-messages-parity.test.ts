import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'

/**
 * `/platform` was English-only until the payouts page moved onto next-intl
 * (#516). A key present in `en` but missing from `es` doesn't throw — next-intl
 * falls back and the reader sees English inside a Spanish page — so parity is
 * asserted here instead of being noticed in production.
 *
 * This used to be scoped to the `platform` namespace because the rest of the
 * catalogue had pre-existing drift: 101 keys that existed top-level in `en` and
 * only under `dashboard.*` in `es`, plus seven leaves with no counterpart at
 * all. #678 cleared that drift, so the assertion now covers the whole
 * catalogue — a new English string added without its Spanish twin fails here,
 * which is the point.
 */
function leafKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function flat(value: unknown, prefix = ''): [string, string][] {
  return value !== null && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        flat(v, prefix ? `${prefix}.${k}` : k),
      )
    : [[prefix, String(value)]]
}

describe('message catalogue', () => {
  const enKeys = leafKeys(en)
  const esKeys = leafKeys(es)

  it('has the same keys in English and Spanish', () => {
    const enSet = new Set(enKeys)
    const esSet = new Set(esKeys)
    expect(
      enKeys.filter((k) => !esSet.has(k)).sort(),
      'keys in en.json with no es.json counterpart',
    ).toEqual([])
    expect(
      esKeys.filter((k) => !enSet.has(k)).sort(),
      'keys in es.json with no en.json counterpart',
    ).toEqual([])
  })

  it('has no empty or untranslated-placeholder strings', () => {
    for (const [key, value] of [...flat(en), ...flat(es)]) {
      expect(value.trim(), key).not.toBe('')
      // Case-sensitive, and `\b`: "Todo" and "Todos ..." are ordinary Spanish
      // words ("All", "All the ..."), and a case-insensitive /^TODO/ flags
      // every one of them. Only a shouted TODO marker is a stub.
      expect(value, key).not.toMatch(/^TODO\b/)
    }
  })

  it('keeps the ICU placeholders of each English string in its Spanish counterpart', () => {
    /**
     * Only the arguments the code passes in, which is the depth-0 names. The
     * branch labels inside a plural — `one {curso} other {cursos}` — are part
     * of the translation and are *supposed* to differ between languages, so a
     * flat `/\{(\w+)/g` would fail every pluralised string.
     */
    const placeholders = (message: string) => {
      const names: string[] = []
      let depth = 0
      for (let i = 0; i < message.length; i++) {
        const char = message[i]
        if (char === '}') depth--
        else if (char === '{') {
          if (depth === 0) {
            const name = /^\s*(\w+)/.exec(message.slice(i + 1))
            if (name) names.push(name[1])
          }
          depth++
        }
      }
      return names.sort()
    }
    const esFlat = Object.fromEntries(flat(es))
    for (const [key, value] of flat(en)) {
      expect(placeholders(esFlat[key] ?? ''), key).toEqual(placeholders(value))
    }
  })
})
