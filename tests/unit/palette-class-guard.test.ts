import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Ratchet on hardcoded Tailwind palette colours (issue #764, epic #766).
 *
 * A school picks a theme and a brand colour, and the theme kit writes them into
 * the design tokens (`primary`, `brand-text`, `brand-tint`, `card`, …). A class
 * like `bg-indigo-600` or `text-gray-500` bypasses that: it renders the same
 * indigo on every school and the same light grey on a dark theme. The sweep
 * replaces them surface by surface; this test keeps each surface swept.
 *
 * Every file's palette-class count is recorded in
 * `palette-class-baseline.json`. A file may not go above its count, and a file
 * that is not listed may have none. When a sweep lowers a count the test fails
 * until the baseline is lowered too, so the list only ever shrinks:
 *
 *   UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts
 *
 * Status colours come from `success` / `warning` / `destructive`, never from a
 * palette. What legitimately stays hardcoded is content — a code-editor theme,
 * medal colours, confetti — and it stays in the baseline with its count.
 */

const ROOT = resolve(__dirname, '../..')
const ROOTS = ['app', 'components', 'lib']
const BASELINE_PATH = resolve(__dirname, 'palette-class-baseline.json')

/**
 * Never counted. Platform marketing is redesigned with the platform brand, not
 * a school's, and the super-admin area is the platform's own console.
 */
const EXEMPT_PREFIXES = [
  'app/[locale]/(public)/page.tsx',
  'app/[locale]/(public)/creators/',
  'app/[locale]/(public)/about/',
  'app/[locale]/(public)/platform-pricing/',
  'app/[locale]/platform/',
  'components/platform/',
]

const PALETTE_CLASS =
  /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?(?![\w-])/g

export function countPaletteClasses(source: string): number {
  return source.match(PALETTE_CLASS)?.length ?? 0
}

function sourceFiles(): string[] {
  const out: string[] = []
  for (const root of ROOTS) {
    for (const entry of readdirSync(resolve(ROOT, root), { recursive: true }) as string[]) {
      const path = join(root, entry)
      if (/\.tsx?$/.test(path) && !EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) out.push(path)
    }
  }
  return out.sort()
}

function scanRepository(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of sourceFiles()) {
    const count = countPaletteClasses(readFileSync(resolve(ROOT, file), 'utf8'))
    if (count > 0) counts[file] = count
  }
  return counts
}

const live = scanRepository()

if (process.env.UPDATE_PALETTE_BASELINE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(live, null, 2)}\n`)
}

const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

describe('palette class guard', () => {
  it('adds no hardcoded palette class beyond the baseline', () => {
    const grown = Object.entries(live)
      .filter(([file, count]) => count > (baseline[file] ?? 0))
      .map(([file, count]) => `${file}: ${baseline[file] ?? 0} → ${count}`)

    expect(
      grown,
      'New hardcoded palette classes. Use the theme tokens instead: card/muted/foreground/' +
        'muted-foreground/border for neutrals, primary/brand-text/brand-tint for brand colour, ' +
        'success/warning/destructive for status. If the colour is content (code theme, medal), ' +
        'say so in review and raise the count.'
    ).toEqual([])
  })

  it('keeps the baseline tight — a swept file lowers its count', () => {
    const stale = Object.entries(baseline)
      .filter(([file, count]) => (live[file] ?? 0) < count)
      .map(([file, count]) => `${file}: ${count} → ${live[file] ?? 0}`)

    expect(
      stale,
      'Fewer palette classes than recorded. Lower the baseline: ' +
        'UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts'
    ).toEqual([])
  })
})

/** A detector that silently matches nothing looks identical to a clean repository. */
describe('palette class guard — the detector itself', () => {
  it('counts palette classes with variants and opacity', () => {
    expect(countPaletteClasses('bg-indigo-600 dark:hover:text-gray-500 border-emerald-200/50')).toBe(3)
  })

  it('ignores tokens, arbitrary values and look-alike words', () => {
    expect(
      countPaletteClasses('bg-primary text-brand-text bg-success/10 bg-[#0A0A0A] from-to-red text-white')
    ).toBe(0)
  })

  it('actually walks the repository', () => {
    expect(sourceFiles().length).toBeGreaterThan(100)
    expect(Object.keys(live).length).toBeGreaterThan(0)
  })

  it('exempts only paths that exist', () => {
    const all = ROOTS.flatMap((root) =>
      (readdirSync(resolve(ROOT, root), { recursive: true }) as string[]).map((entry) => join(root, entry))
    )
    for (const prefix of EXEMPT_PREFIXES) expect(all.some((path) => path.startsWith(prefix)), prefix).toBe(true)
  })
})
