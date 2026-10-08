import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { Render, type Config, type Data } from '@measured/puck'

import { puckConfig } from '@/lib/puck/config'
import {
  DEFAULT_SECTION_ANCHORS,
  SECTION_ALIGNS,
  SECTION_HIDE_ON,
  SECTION_TONES,
  TONE_DEFINITIONS,
  isValidAnchorId,
  normalizeAnchorId,
  toneInnerStyle,
  toneOuterStyle,
  toneSources,
  withDefaultAnchors,
} from '@/lib/puck/utils/section-style'
import {
  sectionInnerProps,
  sectionOuterProps,
  sectionSpacingDefaults,
  sectionSpacingFields,
} from '@/lib/puck/utils/section-spacing'
import { STYLE_ANNOTATIONS, styleAnnotations } from '@/lib/puck/ai-annotations/style'
import messages from '@/messages/en.json'
import esMessages from '@/messages/es.json'

const STYLE_KEYS = ['tone', 'align', 'anchorId', 'hideOn'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const components = puckConfig.components as Record<string, any>
/** Every block on the shared section layer (it spreads sectionSpacingFields). */
const SPACED = Object.entries(components)
  .filter(([, c]) => c.fields?.paddingY === sectionSpacingFields.paddingY)
  .map(([name]) => name)

function render(content: Data['content']) {
  const children = createElement<{ config: Config; data: Data }>(Render<Config>, {
    config: puckConfig,
    data: { root: { props: {} }, content },
  })
  // eslint-disable-next-line react/no-children-prop
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'en', messages, children }))
}

describe('style tokens on the shared section layer', () => {
  it('the section layer is spread into the LMS section blocks', () => {
    expect(SPACED.length).toBeGreaterThanOrEqual(20)
    for (const name of ['FaqAccordion', 'PricingTable', 'CtaBlock', 'StatsBand', 'ContentFeature', 'CtaBanner']) {
      expect(SPACED).toContain(name)
    }
  })

  it('every section block exposes tone/align/anchorId/hideOn with defaults', () => {
    for (const name of SPACED) {
      for (const key of STYLE_KEYS) {
        expect(components[name].fields[key], `${name}.${key} field`).toBeDefined()
        expect(components[name].defaultProps?.[key], `${name}.${key} default`).toBe(sectionSpacingDefaults[key])
      }
    }
  })

  it('Header and Footer are never wrapped in the section layer (sticky header, E1)', () => {
    for (const name of ['Header', 'Footer']) {
      for (const key of STYLE_KEYS) expect(components[name].fields?.[key]).toBeUndefined()
    }
  })

  it('field options match the token enums', () => {
    const values = (key: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sectionSpacingFields as any)[key].options.map((o: { value: string }) => o.value)
    expect(values('tone')).toEqual([...SECTION_TONES])
    expect(values('align')).toEqual([...SECTION_ALIGNS])
    expect(values('hideOn')).toEqual([...SECTION_HIDE_ON])
  })

  it('every new field label is translated in en and es', () => {
    const labels = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...STYLE_KEYS.map((k) => (sectionSpacingFields as any)[k].label),
      ...STYLE_KEYS.flatMap((k) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sectionSpacingFields as any)[k].options ?? []).map((o: { label: string }) => o.label),
      ),
    ]
    const en = messages.puck.fieldLabels as Record<string, string>
    const es = esMessages.puck.fieldLabels as Record<string, string>
    for (const label of labels) {
      expect(en[label], `en ${label}`).toBeTruthy()
      expect(es[label], `es ${label}`).toBeTruthy()
    }
  })
})

describe('anchors', () => {
  it.each([
    ['faq', 'faq'],
    ['#Pricing', 'pricing'],
    ['Preguntas frecuentes', 'preguntas-frecuentes'],
    ['  Über uns!! ', 'uber-uns'],
    ['a--b__c', 'a-b-c'],
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeAnchorId(input)).toBe(expected)
  })

  it.each(['', '   ', '###', '2024', '-', 42, null, undefined])('rejects %j', (input) => {
    expect(normalizeAnchorId(input)).toBeUndefined()
  })

  it('caps the slug at 64 characters and never ends on a dash', () => {
    const slug = normalizeAnchorId(`${'a'.repeat(63)} b`)
    expect(slug).toBe('a'.repeat(63))
    expect(isValidAnchorId(slug)).toBe(true)
    expect(isValidAnchorId('a'.repeat(65))).toBe(false)
    expect(isValidAnchorId('Bad Slug')).toBe(false)
  })

  it('withDefaultAnchors gives the first block of a type its anchor, once, without mutating', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'HeroBlock', props: { id: 'h' } },
        { type: 'FaqAccordion', props: { id: 'f1' } },
        { type: 'FaqSplit', props: { id: 'f2' } },
        { type: 'PricingTable', props: { id: 'p', anchorId: 'plans' } },
        { type: 'ContactForm', props: { id: 'c' } },
        { type: 'TextBlock', props: { id: 't', anchorId: 'contact' } },
      ],
      zones: { 'x:col': [{ type: 'TeamGrid', props: { id: 'tm' } }] },
    }
    const snapshot = JSON.stringify(data)
    const out = withDefaultAnchors(data)
    expect(JSON.stringify(data)).toBe(snapshot)
    const anchors = out.content.map((i) => (i.props as { anchorId?: string }).anchorId)
    expect(anchors).toEqual([undefined, 'faq', undefined, 'plans', undefined, 'contact'])
    expect((out.zones['x:col'][0].props as { anchorId?: string }).anchorId).toBe('team')
    // Unchanged items are the same objects.
    expect(out.content[0]).toBe(data.content[0])
  })

  it('withDefaultAnchors returns the same object when there is nothing to add', () => {
    const data = { content: [{ type: 'HeroBlock', props: {} }] }
    expect(withDefaultAnchors(data)).toBe(data)
  })

  it('the AI annotation names the same default anchors the renderer applies', () => {
    const text = STYLE_ANNOTATIONS['*'].fields?.anchorId?.instructions ?? ''
    for (const anchor of new Set(Object.values(DEFAULT_SECTION_ANCHORS))) expect(text).toContain(anchor)
  })
})

describe('tones', () => {
  it('default tone adds nothing', () => {
    expect(toneOuterStyle('default')).toBeUndefined()
    expect(toneInnerStyle('default')).toBeUndefined()
    expect(toneOuterStyle('bogus')).toBeUndefined()
    expect(sectionOuterProps({}).style).toBeUndefined()
    expect(sectionInnerProps({}).style).toBeUndefined()
  })

  for (const tone of SECTION_TONES.filter((t) => t !== 'default')) {
    it(`${tone}: no custom-property cycles on either wrapper`, () => {
      const outer = toneOuterStyle(tone) as Record<string, string>
      const inner = toneInnerStyle(tone) as Record<string, string>
      const outerDefined = new Set(Object.keys(outer).filter((k) => k.startsWith('--')))
      // The outer wrapper only defines captures, each reading an inherited page variable.
      for (const [name, value] of Object.entries(outer)) {
        for (const ref of value.matchAll(/var\((--[\w-]+)\)/g)) {
          expect(outerDefined.has(ref[1]), `outer ${name} reads its own ${ref[1]}`).toBe(false)
        }
      }
      // The inner wrapper only reads captures (inherited from the outer wrapper).
      for (const [name, value] of Object.entries(inner)) {
        for (const ref of value.matchAll(/var\((--[\w-]+)\)/g)) {
          if (name === 'color') continue
          expect(ref[1].startsWith('--tone-src-'), `inner ${name} reads ${ref[1]}`).toBe(true)
        }
      }
      // Every capture the inner wrapper reads exists on the outer wrapper.
      for (const src of toneSources(TONE_DEFINITIONS[tone])) {
        expect(outer[`--tone-src-${src}`]).toBe(`var(--${src})`)
      }
      // It re-scopes what blocks hardcode, so text-foreground stays readable.
      expect(inner['--background']).toBeDefined()
      expect(inner.color).toBe('var(--foreground)')
    })
  }

  it('the block accent goes on the inner wrapper, after the tone vars', () => {
    const props = sectionInnerProps({ tone: 'brand' }, { ['--block-accent' as string]: 'var(--primary)' })
    const style = props.style as Record<string, string>
    expect(style['--block-accent']).toBe('var(--primary)')
    expect(style['--primary']).toBe('var(--tone-src-primary-foreground)')
  })

  it('a toned block renders one pair of wrappers, no extra <section>, with id and classes', () => {
    const html = render([
      {
        type: 'CtaBlock',
        props: {
          ...components.CtaBlock.defaultProps,
          id: 'cta',
          tone: 'brand',
          align: 'start',
          anchorId: 'Join Now',
          hideOn: 'mobile',
        },
      },
    ])
    expect(html).not.toContain('<section')
    expect(html).toContain('id="join-now"')
    expect(html).toContain('scroll-mt-20')
    expect(html).toContain('data-tone="brand"')
    expect(html).toContain('max-md:hidden')
    expect(html).toContain('--tone-src-primary:var(--primary)')
    expect(html).toContain('--primary:var(--tone-src-primary-foreground)')
    expect(html).toContain('[&amp;_.text-center]:text-start')
  })

  it('old saved blocks without the new props render as before', () => {
    const html = render([{ type: 'FaqAccordion', props: { id: 'f', title: 'FAQ', items: [] } }])
    expect(html).not.toContain('data-tone')
    expect(html).not.toContain(' id="')
  })
})

describe('style annotations', () => {
  it('describe the shared tokens once under "*"', () => {
    expect(styleAnnotations).toBe(STYLE_ANNOTATIONS)
    const fields = STYLE_ANNOTATIONS['*'].fields ?? {}
    for (const key of STYLE_KEYS) expect(fields[key]?.instructions, key).toBeTruthy()
  })

  it('only annotate variant fields the blocks really have', () => {
    for (const [name, entry] of Object.entries(STYLE_ANNOTATIONS)) {
      if (name === '*') continue
      expect(components[name], name).toBeDefined()
      for (const field of Object.keys(entry.fields ?? {})) {
        expect(components[name].fields[field], `${name}.${field}`).toBeDefined()
      }
    }
  })

  it('never tell the model to author colours', () => {
    const all = JSON.stringify(STYLE_ANNOTATIONS)
    expect(all).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    expect(all.length).toBeLessThan(1200)
  })
})

describe('anchor rule parity with @lms/core', () => {
  it('core validateBlock uses the same slug rule as the renderer', async () => {
    const core = await import('@lms/core')
    const style = await import('@/lib/puck/utils/section-style')
    expect(core.ANCHOR_ID_PATTERN.source).toBe(style.ANCHOR_ID_PATTERN.source)
    expect(core.ANCHOR_ID_MAX).toBe(style.ANCHOR_ID_MAX)
  })
})
