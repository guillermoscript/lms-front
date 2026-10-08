import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { safeHref, safeOptionalHref } from '@/lib/puck/utils/safe-href'
import { ButtonLink, safeHref as reexported } from '@/lib/puck/utils/button-link'

/** Critique C1: a render-side guard for every author/AI-supplied landing href. */
describe('safeHref', () => {
  it.each([
    ['/courses', '/courses'],
    ['/p/about?x=1#team', '/p/about?x=1#team'],
    ['#faq', '#faq'],
    ['#', '#'],
    ['https://example.com/a', 'https://example.com/a'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
    ['mailto:hello@school.test', 'mailto:hello@school.test'],
    ['tel:+584121234567', 'tel:+584121234567'],
    ['  /pricing  ', '/pricing'],
    // Links saved before the guard: upgraded, not broken.
    ['http://instagram.com/school', 'https://instagram.com/school'],
    ['HTTP://Example.com', 'https://Example.com'],
    ['www.facebook.com/school', 'https://www.facebook.com/school'],
  ])('keeps %j', (input, expected) => {
    expect(safeHref(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'http:/evil.example',
    'http:\\\\evil.example',
    'ftp://example.com',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n\\evil.example',
    'courses',
    './courses',
    '?q=1',
    'example.com',
    '',
    '   ',
  ])('drops %j to "#"', (input) => {
    expect(safeHref(input)).toBe('#')
  })

  it('treats non-strings as "#"', () => {
    for (const v of [undefined, null, 42, {}, ['/x']]) expect(safeHref(v)).toBe('#')
  })

  it('safeOptionalHref keeps "no link" as undefined', () => {
    expect(safeOptionalHref(undefined)).toBeUndefined()
    expect(safeOptionalHref('')).toBeUndefined()
    expect(safeOptionalHref('javascript:x')).toBe('#')
    expect(safeOptionalHref('/a')).toBe('/a')
  })

  it('is re-exported from button-link and applied by ButtonLink', () => {
    expect(reexported).toBe(safeHref)
    const bad = renderToStaticMarkup(createElement(ButtonLink, { href: 'javascript:alert(1)' }, 'Go'))
    expect(bad).toContain('href="#"')
    expect(bad).not.toContain('javascript')
    const good = renderToStaticMarkup(createElement(ButtonLink, { href: '/courses' }, 'Go'))
    expect(good).toContain('href="/courses"')
  })
})
