import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { TenantCssVarsServer } from '@/components/tenant/tenant-css-vars-server'
import {
  KIT_LIGHT_INK,
  KIT_SURFACES,
  KIT_THEME_IDS,
  KIT_THEMES,
  deriveKitStructure,
  deriveKitVars,
  type CSSVariableMap,
  type StoredKitTheme,
} from '@/lib/themes/kit'

const ROOT = resolve(__dirname, '../..')

type Props = Parameters<typeof TenantCssVarsServer>[0]
const render = (props: Props) => renderToStaticMarkup(createElement(TenantCssVarsServer, props))
const kit = (theme: StoredKitTheme['theme'], brand: string): StoredKitTheme => ({ type: 'kit', theme, brand })

/** The component's serialisation, for building expectations from the engine. */
const block = (selector: string, vars: CSSVariableMap) =>
  `${selector} {\n    ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join('\n    ')}\n  }\n`

/** The body of the first `<selector> {` rule in the rendered CSS. */
function ruleBody(html: string, selector: string): string {
  const start = html.indexOf(`${selector} {`)
  if (start === -1) return ''
  return html.slice(start, html.indexOf('}', start))
}

/** `--name: value;` declarations in a rule body, as a map. */
function declarations(body: string): CSSVariableMap {
  return Object.fromEntries([...body.matchAll(/(--[\w-]+): ([^;]+);/g)].map(([, k, v]) => [k, v]))
}

describe('TenantCssVarsServer — no theme', () => {
  it('renders nothing, so the platform palette in globals.css applies', () => {
    expect(render({ theme: null })).toBe('')
    expect(render({ theme: undefined })).toBe('')
    expect(render({})).toBe('')
  })
})

describe('TenantCssVarsServer — kit theme', () => {
  const html = render({ theme: kit('andina', '#9A3F2C') })
  const { light, dark } = deriveKitVars('andina', '#9A3F2C')
  const structure = deriveKitStructure('andina')

  it('writes one <style>: :root = light colours + fonts and corners, .dark = dark colours', () => {
    expect(html).toBe(`<style>${block(':root', { ...light, ...structure })}${block('  .dark', dark)}</style>`)
  })

  it('declares exactly the kit variables and nothing from the legacy model', () => {
    const root = declarations(ruleBody(html, ':root'))
    const darkVars = declarations(ruleBody(html, '.dark'))
    expect(Object.keys(root).sort()).toEqual([...Object.keys(light), ...Object.keys(structure)].sort())
    expect(Object.keys(darkVars).sort()).toEqual(Object.keys(dark).sort())
    // Fonts and corners are mode-independent: emitted once, on :root.
    for (const key of Object.keys(structure)) expect(darkVars, key).not.toHaveProperty(key)
    expect(html).not.toContain('--secondary-brand')
    expect(html).not.toContain('<link')
    expect(html.match(/<style>/g)).toHaveLength(1)
  })

  it('pins what a student of an Andina · Terracota school gets', () => {
    const root = declarations(ruleBody(html, ':root'))
    expect(root['--brand']).toBe('#9A3F2C')
    expect(root['--primary']).toBe('#9A3F2C')
    expect(root['--primary-foreground']).toBe(KIT_LIGHT_INK)
    expect(root['--background']).toBe(KIT_SURFACES.warm.light.background)
    expect(root['--font-heading']).toBe('var(--font-lora), ui-serif, Georgia, serif')
    expect(root['--font-sans']).toBe('var(--font-public-sans), ui-sans-serif, system-ui, sans-serif')
    expect(root['--font-mono']).toBe('var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace')
    expect(root['--radius']).toBe('0.625rem')
    expect(root['--radius-button']).toBe('8px')
    expect(root['--radius-card']).toBe('10px')
    expect(root['--radius-input']).toBe('8px')

    const darkVars = declarations(ruleBody(html, '.dark'))
    expect(darkVars['--brand']).toBe('#9A3F2C')
    expect(darkVars['--primary']).toBe('#9A3F2C')
    expect(darkVars['--background']).toBe(KIT_SURFACES.warm.dark.background)
  })

  it("renders every theme from the engine's output", () => {
    for (const id of KIT_THEME_IDS) {
      const brand = KIT_THEMES[id].swatches[0].hex
      const vars = deriveKitVars(id, brand)
      expect(render({ theme: kit(id, brand) }), id).toBe(
        `<style>${block(':root', { ...vars.light, ...deriveKitStructure(id) })}${block('  .dark', vars.dark)}</style>`,
      )
    }
  })

  it('renders the theme it is given; the plan gate runs before it, in the layout', () => {
    const custom = render({ theme: kit('luz', '#E53935') })
    expect(declarations(ruleBody(custom, ':root'))['--brand']).toBe('#E53935')
  })
})

describe('no client-side inline style writes for theme vars', () => {
  // Files allowed to write inline styles through the DOM (style.setProperty,
  // style.cssText, setAttribute('style')), each with the reason it is not a
  // theme var. Empty: nothing under components/, app/, lib/ or hooks/ does so
  // today. The removed TenantCssVars re-applier did, and its inline styles beat
  // the server <style> after a light/dark toggle.
  const ALLOW_LIST: Record<string, string> = {}

  // Any inline DOM style write, not just a literal '--' key: the re-applier's
  // main loop was `root.style.setProperty(key, value)` with a variable key.
  const INLINE_STYLE_WRITE = [
    /\.style\.setProperty\s*\(/,
    /\.style\.cssText\s*=/,
    /\.setAttribute\s*\(\s*['"`]style['"`]/,
  ]
  const writesInlineStyle = (source: string) => INLINE_STYLE_WRITE.some((re) => re.test(source))

  function collect(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) collect(path, out)
      else if (/\.tsx?$/.test(name)) out.push(path)
    }
    return out
  }

  it('the client re-applier is gone', () => {
    expect(existsSync(join(ROOT, 'components/tenant/tenant-css-vars.tsx'))).toBe(false)
  })

  it('the guard catches every shape the removed re-applier (and its cousins) used', () => {
    expect(writesInlineStyle('root.style.setProperty(key, value)')).toBe(true)
    expect(writesInlineStyle("root.style.setProperty('--radius', r)")).toBe(true)
    expect(writesInlineStyle('document.documentElement.style.cssText = css')).toBe(true)
    expect(writesInlineStyle("el.setAttribute('style', css)")).toBe(true)
    expect(writesInlineStyle('<div style={{ color: "red" }} />')).toBe(false)
  })

  it('no component, route, lib or hook writes inline styles through the DOM', () => {
    const files = ['components', 'app', 'lib', 'hooks']
      .map((d) => join(ROOT, d))
      .filter((d) => existsSync(d))
      .flatMap((d) => collect(d))
    expect(files.length).toBeGreaterThan(0)
    const hits = files
      .filter((f) => writesInlineStyle(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .filter((f) => !(f in ALLOW_LIST))
    expect(hits).toEqual([])
  })
})
