import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { contrastRatio, mixOklch } from '@/lib/color/contrast'
import {
  DEFAULT_KIT_THEME,
  deriveKitVars,
  KIT_CORNERS,
  KIT_FONT_VARIABLES,
  KIT_SURFACES,
  KIT_THEMES,
} from '@/lib/themes/kit'
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

describe('status and brand tokens (#764)', () => {
  const darkBlock = ruleBody(globals, '.dark')
  const value = (block: string, name: string) => block.match(new RegExp(`\\s${name}: ([^;]+);`))?.[1]

  const SWEEP_TOKENS = [
    'success',
    'success-foreground',
    'warning',
    'warning-foreground',
    'destructive-foreground',
    'brand',
    'brand-text',
    'brand-tint',
  ]

  it('registers each token as a colour utility with a light and a dark default', () => {
    for (const token of SWEEP_TOKENS) {
      expect(themeBlock, token).toContain(`--color-${token}: var(--${token});`)
      expect(value(rootBlock, `--${token}`), `:root --${token}`).toBeTruthy()
      expect(value(darkBlock, `--${token}`), `.dark --${token}`).toBeTruthy()
    }
  })

  it('backs every @theme colour with an unlayered :root value', () => {
    // `bg-success` compiles to var(--success); with no value it is transparent.
    const colors = [...themeBlock.matchAll(/--color-[\w-]+: var\((--[\w-]+)\);/g)].map(([, name]) => name)
    expect(colors.length).toBeGreaterThan(20)
    for (const name of colors) expect(value(rootBlock, name), name).toBeTruthy()
  })

  it('keeps status colours readable on every kit surface and the platform palette', () => {
    // Status colours are the platform's, so they must hold on any theme a school
    // picks: as text on background, card, muted and their own /15 tint, and as a
    // fill under their foreground.
    const platform = {
      light: { background: value(rootBlock, '--background')!, card: value(rootBlock, '--card')!, muted: value(rootBlock, '--muted')! },
      dark: { background: value(darkBlock, '--background')!, card: value(darkBlock, '--card')!, muted: value(darkBlock, '--muted')! },
    }
    const surfaces = [platform, ...Object.values(KIT_SURFACES)]
    for (const mode of ['light', 'dark'] as const) {
      const block = mode === 'light' ? rootBlock : darkBlock
      for (const status of ['success', 'warning', 'destructive']) {
        const color = value(block, `--${status}`)!
        const ink = value(block, `--${status}-foreground`)!
        expect(contrastRatio(ink, color), `${mode} ${status} fill`).toBeGreaterThanOrEqual(4.5)
        for (const s of surfaces.map((set) => set[mode])) {
          const tint = mixOklch(s.card, color, 0.15)!
          for (const bg of [s.background, s.card, s.muted, tint]) {
            expect(contrastRatio(color, bg), `${mode} ${status} on ${bg}`).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    }
  })

  it('keeps the platform brand-text readable on background, card, muted and brand-tint', () => {
    for (const block of [rootBlock, darkBlock]) {
      const text = value(block, '--brand-text')!
      for (const bg of ['--background', '--card', '--muted', '--brand-tint']) {
        expect(contrastRatio(text, value(block, bg)!), bg).toBeGreaterThanOrEqual(4.5)
      }
    }
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

describe('muted helper text (#773)', () => {
  const darkBlock = ruleBody(globals, '.dark')
  const value = (block: string, name: string) => block.match(new RegExp(`\\s${name}: ([^;]+);`))?.[1]

  it('keeps --muted-foreground at AA on every fill it is used on, platform and kit', () => {
    // Helper captions sit on panels, not only on background: the shadcn default
    // (L 0.552) read 4.39:1 on `muted` and 4.32:1 on `brand-tint`, which is what
    // #773 was. Status /10 tints are the third fill — `bg-destructive/10` and
    // friends carry a muted caption on the payment and payout screens.
    const platform = {
      light: {
        background: value(rootBlock, '--background')!,
        card: value(rootBlock, '--card')!,
        muted: value(rootBlock, '--muted')!,
        mutedForeground: value(rootBlock, '--muted-foreground')!,
        brandTint: value(rootBlock, '--brand-tint')!,
      },
      dark: {
        background: value(darkBlock, '--background')!,
        card: value(darkBlock, '--card')!,
        muted: value(darkBlock, '--muted')!,
        mutedForeground: value(darkBlock, '--muted-foreground')!,
        brandTint: value(darkBlock, '--brand-tint')!,
      },
    }

    for (const mode of ['light', 'dark'] as const) {
      const block = mode === 'light' ? rootBlock : darkBlock
      const sets = [
        platform[mode],
        // A kit derives brand-tint as card mixed with the brand (lib/themes/kit.ts).
        ...Object.values(KIT_SURFACES).map((set) => ({
          ...set[mode],
          brandTint: mixOklch(set[mode].card, value(block, '--brand')!, mode === 'dark' ? 0.22 : 0.12)!,
        })),
      ]
      for (const s of sets) {
        const statusTints = ['success', 'warning', 'destructive'].map(
          (status) => mixOklch(s.card, value(block, `--${status}`)!, 0.1)!,
        )
        for (const bg of [s.background, s.card, s.muted, s.brandTint, ...statusTints]) {
          expect(
            contrastRatio(s.mutedForeground, bg),
            `${mode} muted-foreground ${s.mutedForeground} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('never fades muted text with an opacity modifier at caption sizes', () => {
    // No opacity modifier survives AA on any surface: even /80 reads 3.28:1 on
    // the platform light background and 4.17:1 on dark `muted`. A faded caption
    // is therefore always a bug, not a tuning choice — it has to be a different
    // token, not a translucent one. Icons may still fade; only text is checked.
    const faded = /text-muted-foreground\/\d+/
    const caption = /text-(?:xs|\[1[01]px\])/
    // These variants colour something other than the element's own text — a
    // placeholder, or `content` on a pseudo-element. axe-core does not evaluate
    // either for contrast, and a `::before` separator has no node to hang
    // aria-hidden on, so neither is in scope here.
    const notOwnText = /(?:placeholder|before|after|selection|file):text-muted-foreground\/\d+/g
    const hits: string[] = []
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const source = readFileSync(file, 'utf8')
        if (!faded.test(source)) continue
        source.split('\n').forEach((line, i) => {
          // Both classes on one element: a faded caption. A faded icon sitting
          // on a line of its own carries no size class and does not match.
          const own = line.replace(notOwnText, '')
          if (faded.test(own) && caption.test(own)) hits.push(`${relative(ROOT, file)}:${i + 1}`)
        })
      }
    }
    expect(hits).toEqual([])
  })
})

describe('Kódigo dark default wiring (app/[locale]/layout.tsx)', () => {
  it('passes the plan-resolved theme through defaultThemeFor and never forces a theme', () => {
    expect(layoutSource).toContain('const defaultTheme = defaultThemeFor(tenantInfo?.theme);')
    expect(layoutSource).toContain('defaultTheme={defaultTheme}')
    expect(layoutSource).not.toMatch(/\bforcedTheme\s*=/)
    // tenantInfo.theme is the stored kit resolved against custom_branding (#763).
    expect(layoutSource).toContain('theme: resolveSchoolTheme(')
    expect(layoutSource).toMatch(/theme: resolveSchoolTheme\([^)]*\{ customBranding \}\)/)
  })
})

describe('the platform palette is the default theme (#766)', () => {
  const darkBlock = ruleBody(globals, '.dark')
  const value = (block: string, name: string) => block.match(new RegExp(`\\s${name}: ([^;]+);`))?.[1]

  // Settled on #766: a school with no theme row renders the default theme with
  // its recommended colour, not a separate platform palette. The two used to be
  // different palettes (shadcn zinc + teal vs. Estructura cool + Tinta azul),
  // so "no theme" and "the default theme" were two different screens and every
  // contrast fix had to be made twice.
  it('writes deriveKitVars(default theme, its first swatch) into :root and .dark', () => {
    const brand = KIT_THEMES[DEFAULT_KIT_THEME].swatches[0].hex
    const vars = deriveKitVars(DEFAULT_KIT_THEME, brand)
    for (const [mode, block] of [['light', rootBlock], ['dark', darkBlock]] as const) {
      for (const [name, expected] of Object.entries(vars[mode])) {
        expect(value(block, name), `${mode} ${name}`).toBe(expected)
      }
    }
  })
})
