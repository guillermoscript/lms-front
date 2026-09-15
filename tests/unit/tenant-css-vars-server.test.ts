import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  TenantCssVarsServer,
  resolvePresetVars,
} from '@/components/tenant/tenant-css-vars-server'
import { deriveKitStructure, deriveKitVars } from '@/lib/themes/kit'
import { getPresetById, type CSSVariableMap, type StoredPreset } from '@/lib/themes/presets'

const ROOT = resolve(__dirname, '../..')

type Props = Parameters<typeof TenantCssVarsServer>[0]
const render = (props: Props) => renderToStaticMarkup(createElement(TenantCssVarsServer, props))

/** Same serialisation the component used on master, for building expectations. */
const block = (selector: string, vars: CSSVariableMap) =>
  `${selector} {\n    ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join('\n    ')}\n  }\n`

/** The body of the first `<selector> {` rule in the rendered CSS. */
function ruleBody(html: string, selector: string): string {
  const start = html.indexOf(`${selector} {`)
  if (start === -1) return ''
  return html.slice(start, html.indexOf('}', start))
}

describe('resolvePresetVars', () => {
  it('curated returns the curated preset variables', () => {
    const preset = getPresetById('default')
    expect(preset).toBeTruthy()
    const { light, dark } = resolvePresetVars({ type: 'curated', id: 'default' })
    expect(light).toBe(preset!.variables.light)
    expect(dark).toBe(preset!.variables.dark)
  })

  it('unknown curated id resolves to nothing', () => {
    expect(resolvePresetVars({ type: 'curated', id: 'does-not-exist' })).toEqual({
      light: undefined,
      dark: undefined,
    })
  })

  it('custom returns its stored variables', () => {
    const variables = { light: { '--primary': 'red' }, dark: { '--primary': 'blue' } }
    const { light, dark } = resolvePresetVars({ type: 'custom', id: 'custom-x', variables })
    expect(light).toBe(variables.light)
    expect(dark).toBe(variables.dark)
  })

  it('kit derives its variables from theme + brand', () => {
    expect(resolvePresetVars({ type: 'kit', theme: 'andina', brand: '#9A3F2C' })).toEqual(
      deriveKitVars('andina', '#9A3F2C'),
    )
  })
})

describe('TenantCssVarsServer — kit preset', () => {
  const kitPreset: StoredPreset = {
    type: 'kit',
    theme: 'andina',
    brand: '#9A3F2C',
    radius: '1rem',
    fontFamily: 'Lora',
  }
  const html = render({ themePreset: kitPreset, primaryColor: '#7c3aed', secondaryColor: '#fde047' })

  it('emits the derived vars in a :root and a .dark block', () => {
    const { light, dark } = deriveKitVars('andina', '#9A3F2C')
    const rootBody = ruleBody(html, ':root')
    const darkBody = ruleBody(html, '.dark')
    expect(rootBody).toContain('--brand:')
    expect(darkBody).toContain('--brand:')
    for (const [k, v] of Object.entries(light)) expect(rootBody).toContain(`${k}: ${v};`)
    for (const [k, v] of Object.entries(dark)) expect(darkBody).toContain(`${k}: ${v};`)
  })

  it('emits the theme fonts and corners once, in the :root block', () => {
    const structure = deriveKitStructure('andina')
    const rootBody = ruleBody(html, ':root')
    const darkBody = ruleBody(html, '.dark')
    expect(Object.keys(structure)).toEqual(
      expect.arrayContaining(['--font-sans', '--font-heading', '--radius', '--radius-button', '--radius-card', '--radius-input']),
    )
    for (const [k, v] of Object.entries(structure)) {
      expect(rootBody).toContain(`${k}: ${v};`)
      expect(darkBody).not.toContain(`${k}:`)
    }
  })

  it('ignores the legacy primary_color, radius and font overrides', () => {
    expect(html).not.toContain('--primary: #7c3aed')
    expect(html).not.toContain('#7c3aed')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('--radius: 1rem')
    expect(html).not.toContain('"Lora"')
  })

  it('still applies the secondary brand colour', () => {
    expect(html).toContain('--secondary-brand: #fde047;')
  })
})

// Outputs captured from master before the kit branch landed. Curated, custom
// and no-preset rendering must stay byte-identical.
describe('TenantCssVarsServer — legacy presets unchanged', () => {
  it('custom preset', () => {
    expect(
      render({
        themePreset: {
          type: 'custom',
          id: 'custom-x',
          variables: { light: { '--primary': 'red' }, dark: { '--primary': 'blue' } },
        },
      }),
    ).toBe('<style>:root {\n    --primary: red;\n  }\n  .dark {\n    --primary: blue;\n  }\n</style>')
  })

  it('no preset + primaryColor', () => {
    expect(render({ themePreset: null, primaryColor: '#7c3aed' })).toBe(
      '<style>:root {\n    --primary: #7c3aed;\n    --sidebar-primary: #7c3aed;\n    --ring: #7c3aed;\n    --primary-foreground: #ffffff;\n    --sidebar-primary-foreground: #ffffff;\n  }\n</style>',
    )
  })

  it('nothing to emit renders nothing', () => {
    expect(render({})).toBe('')
  })

  it('curated + radius + font + primaryColor appends the legacy override block', () => {
    const preset = getPresetById('default')!
    const fontVars = { '--radius': '1rem', '--font-sans': '"Lora", sans-serif' }
    const expected =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&amp;display=swap"/>' +
      '<style>' +
      block(':root', { ...preset.variables.light, ...fontVars }) +
      block('  .dark', { ...preset.variables.dark, ...fontVars }) +
      ':root {\n    --primary: #7c3aed;\n    --sidebar-primary: #7c3aed;\n    --ring: #7c3aed;\n    --primary-foreground: #ffffff;\n    --sidebar-primary-foreground: #ffffff;\n    --secondary-brand: #fde047;\n  }\n' +
      '</style>'
    expect(
      render({
        themePreset: { type: 'curated', id: 'default', radius: '1rem', fontFamily: 'Lora' },
        primaryColor: '#7c3aed',
        secondaryColor: '#fde047',
      }),
    ).toBe(expected)
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
