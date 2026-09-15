import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
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

/** The body of the first `<selector> {` rule, nested blocks included. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i)
  }
  return css.slice(start)
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
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

  it('puts every declared family on <html> and none on <body>', () => {
    const list = fontsSource.slice(fontsSource.indexOf('export const fontVariables'))
    for (const { name } of fontDeclarations) expect(list, name).toMatch(new RegExp(`\\b${name}\\b`))
    expect(layoutSource).toContain('<html lang={locale} className={fontVariables}')
    // A role on :root cannot resolve a family variable set on <body>.
    expect(layoutSource).toContain('<body className="antialiased">')
    expect(layoutSource).not.toMatch(/\.variable\b/)
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
    expect(themeBlock).toContain('@keyframes')
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

  it('never glues a corner token to the next class', () => {
    // `rounded-inputhas-[…]` is one unknown class: Tailwind emits nothing for it
    // and both halves silently disappear (it collapsed PromptInput to 28px).
    const glued = /rounded-(?:[tblr]-)?(?:button|card|input)(?=[\w[(])/
    const hits = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => glued.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file))
    expect(hits).toEqual([])
    expect(glued.test('has-[textarea]:rounded-inputhas-[>x]:h-auto')).toBe(true)
    expect(glued.test('rounded-input has-[>x]:h-auto')).toBe(false)
  })

  it('lets a call-site rounded-* replace a corner token in cn()', () => {
    expect(cn('rounded-button', 'rounded-full')).toBe('rounded-full')
    expect(cn('rounded-card', 'rounded-2xl')).toBe('rounded-2xl')
    expect(cn('rounded-xl', 'rounded-card')).toBe('rounded-card')
    expect(cn('rounded-t-card', 'rounded-t-none')).toBe('rounded-t-none')
    expect(cn('rounded-button', 'rounded-[calc(var(--radius-button)-2px)]')).toBe(
      'rounded-[calc(var(--radius-button)-2px)]',
    )
  })
})

describe('Kódigo dark default wiring (app/[locale]/layout.tsx)', () => {
  it('passes the gated preset through defaultThemeFor and never forces a theme', () => {
    expect(layoutSource).toContain('const defaultTheme = defaultThemeFor(tenantInfo?.theme_preset);')
    expect(layoutSource).toContain('defaultTheme={defaultTheme}')
    expect(layoutSource).not.toMatch(/\bforcedTheme\s*=/)
    // tenantInfo.theme_preset is null below Business (custom_branding gate).
    expect(layoutSource).toMatch(/theme_preset: customBranding\s*\?/)
  })
})
