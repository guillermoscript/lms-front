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
 * Two counts per file are recorded in `palette-class-baseline.json`:
 *
 *   palette — `bg-indigo-600`, `dark:text-gray-500`, `border-emerald-200/50`
 *   raw     — the same bypass written another way: a literal colour in an
 *             arbitrary value (`bg-[#0A0A0A]`, `text-[rgb(20,20,20)]`) and the
 *             `-white` / `-black` utilities. The school-public sweep (#764
 *             surface 2) added this half: the issue names
 *             `school-landing-page.tsx`'s `bg-[#0A0A0A]` as a thing to remove,
 *             and a palette-only detector cannot see it come back.
 *
 * A file may not go above either count, and a file that is not listed may have
 * neither. When a sweep lowers a count the test fails until the baseline is
 * lowered too, so the list only ever shrinks:
 *
 *   UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts
 *
 * Status colours come from `success` / `warning` / `destructive`, never from a
 * palette. What legitimately stays hardcoded is content — a code-editor theme,
 * medal colours, confetti, a gold rating star — and it stays in the baseline
 * with its count. An arbitrary value built from a token (`bg-[var(--brand)]`,
 * `bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]`) is not a bypass
 * and is not counted.
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

/** The colour utility prefixes both detectors share. */
const PREFIX = '(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|placeholder|accent|caret)'

const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}(?:/\\d{1,3})?(?![\\w-])`,
  'g'
)

/** `bg-[#0A0A0A]`, `text-[rgb(20,20,20)]`, `border-[hsl(0_0%_10%)]`, `bg-[oklch(0.2_0_0)]`. */
const ARBITRARY_COLOR = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\\([^\\]]*\\))\\](?:/\\d{1,3})?(?![\\w-])`,
  'g'
)

/** `text-white`, `dark:bg-black/40`, `border-white/10`. */
const WHITE_BLACK_CLASS = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-(?:white|black)(?:/\\d{1,3})?(?![\\w-])`,
  'g'
)

export function countPaletteClasses(source: string): number {
  return source.match(PALETTE_CLASS)?.length ?? 0
}

/**
 * The non-palette ways to hardcode the same colour. An arbitrary value whose
 * contents are a token (`bg-[var(--brand)]`, a `color-mix()` over one) never
 * matches ARBITRARY_COLOR, because it starts with neither a `#` nor a colour
 * function — that is the point, those follow the theme.
 */
export function countRawColors(source: string): number {
  return (source.match(ARBITRARY_COLOR)?.length ?? 0) + (source.match(WHITE_BLACK_CLASS)?.length ?? 0)
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

/** Per file: `[palette, raw]`. A file with neither is left out entirely. */
type Counts = Record<string, [number, number]>

function scanRepository(): Counts {
  const counts: Counts = {}
  for (const file of sourceFiles()) {
    const source = readFileSync(resolve(ROOT, file), 'utf8')
    const pair: [number, number] = [countPaletteClasses(source), countRawColors(source)]
    if (pair[0] > 0 || pair[1] > 0) counts[file] = pair
  }
  return counts
}

const live = scanRepository()

if (process.env.UPDATE_PALETTE_BASELINE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(live, null, 2)}\n`)
}

const baseline: Counts = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

const KINDS = [
  { index: 0, name: 'palette class' },
  { index: 1, name: 'raw colour' },
] as const

function recorded(file: string, index: number): number {
  return baseline[file]?.[index] ?? 0
}

describe('palette class guard', () => {
  for (const kind of KINDS) {
    it(`adds no hardcoded ${kind.name} beyond the baseline`, () => {
      const grown = Object.entries(live)
        .filter(([file, pair]) => pair[kind.index] > recorded(file, kind.index))
        .map(([file, pair]) => `${file}: ${recorded(file, kind.index)} → ${pair[kind.index]}`)

      expect(
        grown,
        `New hardcoded ${kind.name}es. Use the theme tokens instead: card/muted/foreground/` +
          'muted-foreground/border for neutrals, primary/brand-text/brand-tint for brand colour, ' +
          'success/warning/destructive for status. If the colour is content (code theme, medal), ' +
          'say so in review and raise the count.'
      ).toEqual([])
    })

    it(`keeps the ${kind.name} baseline tight — a swept file lowers its count`, () => {
      const stale = Object.entries(baseline)
        .filter(([file, pair]) => (live[file]?.[kind.index] ?? 0) < pair[kind.index])
        .map(([file, pair]) => `${file}: ${pair[kind.index]} → ${live[file]?.[kind.index] ?? 0}`)

      expect(
        stale,
        `Fewer ${kind.name}es than recorded. Lower the baseline: ` +
          'UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts'
      ).toEqual([])
    })
  }
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

  it('counts the non-palette ways to hardcode a colour', () => {
    expect(
      countRawColors('bg-[#0A0A0A] dark:bg-[#18181b]/50 text-[rgb(20,20,20)] text-white border-black/10')
    ).toBe(5)
  })

  it('does not count an arbitrary value built from a token', () => {
    expect(
      countRawColors(
        'bg-[var(--brand)] text-[color-mix(in_oklch,var(--primary)_60%,transparent)] ' +
          'bg-[url(/hero.png)] w-[700px] blur-[140px] max-w-[200px]'
      )
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
