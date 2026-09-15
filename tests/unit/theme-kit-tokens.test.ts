import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { KIT_CORNERS, KIT_FONT_VARIABLES } from '@/lib/themes/kit'
import { cn } from '@/lib/utils'

/**
 * Issue #762 — the token layer a theme kit writes into. The kit's own tests
 * cannot see this wiring: the `next/font` declarations, the unlayered defaults
 * in globals.css that the registered tokens depend on, and the primitives
 * reading the per-component corner tokens.
 */

const ROOT = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

const fontsSource = read('lib/themes/fonts.ts')
const layoutSource = read('app/[locale]/layout.tsx')
const globals = read('app/globals.css')

/** `const name = Loader({ ...options })` declarations. */
const fontDeclarations = [...fontsSource.matchAll(/const (\w+) = (\w+)\(\{([\s\S]*?)\}\)/g)].map(
  ([, name, loader, options]) => ({ name, loader, options }),
)

/** The body of the first `<selector> {` rule, up to its first closing brace. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return ''
  return css.slice(start, css.indexOf('}', start))
}

const themeBlock = ruleBody(globals, '@theme inline')
const rootBlock = ruleBody(globals, ':root')

describe('next/font declarations (lib/themes/fonts.ts)', () => {
  it('declares every kit family exactly once, with the variable the kit maps', () => {
    for (const [family, variable] of Object.entries(KIT_FONT_VARIABLES)) {
      const matches = fontDeclarations.filter((d) => d.loader === family.replace(/ /g, '_'))
      expect(matches, family).toHaveLength(1)
      expect(matches[0].options, family).toContain(`variable: '${variable}'`)
    }
  })

  it('preloads only the platform defaults', () => {
    for (const { loader, options } of fontDeclarations) {
      const preloaded = !/preload:\s*false/.test(options)
      expect(preloaded, loader).toBe(loader === 'Noto_Sans' || loader === 'Geist_Mono')
    }
  })

  it('puts every declared family on <html>', () => {
    const list = fontsSource.slice(fontsSource.indexOf('export const fontVariables'))
    for (const { name } of fontDeclarations) expect(list, name).toMatch(new RegExp(`\\b${name}\\b`))
    expect(layoutSource).toContain('<html lang={locale} className={fontVariables}')
    expect(layoutSource).not.toContain('next/font')
  })

  it('maps the platform defaults in globals.css to the declared variables', () => {
    expect(fontsSource).toContain("variable: '--font-noto-sans'")
    expect(fontsSource).toContain("variable: '--font-geist-mono'")
    expect(rootBlock).toMatch(/--font-sans: var\(--font-noto-sans\), /)
    expect(rootBlock).toMatch(/--font-mono: var\(--font-geist-mono\), /)
  })
})

describe('globals.css tokens', () => {
  it('registers the role and corner tokens with Tailwind', () => {
    for (const token of ['--font-sans', '--font-heading', '--font-mono', '--radius-button', '--radius-card', '--radius-input']) {
      expect(themeBlock, token).toContain(`${token}: var(${token});`)
    }
  })

  it('gives every self-referencing @theme token an unlayered :root value', () => {
    // Tailwind emits `--x: var(--x)` into @layer theme for these; without an
    // unlayered value the cycle wins and the utility resolves to nothing.
    const selfRefs = [...themeBlock.matchAll(/(--[\w-]+): var\(\1\);/g)].map(([, name]) => name)
    expect(selfRefs.length).toBeGreaterThanOrEqual(6)
    for (const name of selfRefs) expect(rootBlock, name).toMatch(new RegExp(`${name}: [^;]+;`))
  })

  it('defaults the corner tokens to the pre-kit corners, which soft corners reproduce', () => {
    expect(rootBlock).toContain('--radius: 0.625rem;')
    expect(rootBlock).toContain('--radius-button: calc(var(--radius) - 2px);')
    expect(rootBlock).toContain('--radius-card: var(--radius);')
    expect(rootBlock).toContain('--radius-input: calc(var(--radius) - 2px);')
    expect(KIT_CORNERS.soft.base).toBe('0.625rem')
  })

  it('sets headings and card titles in --font-heading, which defaults to --font-sans', () => {
    expect(rootBlock).toContain('--font-heading: var(--font-sans);')
    expect(globals).toMatch(
      /h1,\s*h2,\s*h3,\s*\[data-slot="card-title"\]\s*\{\s*font-family: var\(--font-heading\);/,
    )
  })
})

describe('primitives read the per-component corner tokens', () => {
  it('button, card and input-like primitives use the tokens, not the shared scale', () => {
    const button = read('components/ui/button.tsx')
    expect(button).toContain('rounded-button')
    expect(button).not.toMatch(/\brounded-(sm|md)\b/)

    const card = read('components/ui/card.tsx')
    for (const cls of ['rounded-card', 'rounded-t-card', 'rounded-b-card']) expect(card).toContain(cls)
    expect(card).not.toMatch(/\brounded-(t-|b-)?lg\b/)

    for (const file of ['input', 'textarea', 'select', 'combobox', 'input-group']) {
      expect(read(`components/ui/${file}.tsx`), file).toContain('rounded-input')
    }
    expect(read('components/ui/input.tsx')).not.toMatch(/\brounded-md\b/)
    expect(read('components/ui/textarea.tsx')).not.toMatch(/\brounded-md\b/)
  })

  it('lets a call-site rounded-* replace a corner token in cn()', () => {
    expect(cn('rounded-button', 'rounded-full')).toBe('rounded-full')
    expect(cn('rounded-card', 'rounded-2xl')).toBe('rounded-2xl')
    expect(cn('rounded-xl', 'rounded-card')).toBe('rounded-card')
    expect(cn('rounded-t-card', 'rounded-t-none')).toBe('rounded-t-none')
    expect(cn('rounded-button', 'rounded-[calc(var(--radius-button)*0.75)]')).toBe(
      'rounded-[calc(var(--radius-button)*0.75)]',
    )
  })
})
