import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'
import { CommunityMarkdown } from '@/components/community/community-markdown'

// #872: community posts render a small, safe markdown subset.
function render(content: string): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'en',
      messages,
      timeZone: 'UTC',
      children: createElement(CommunityMarkdown, { content }),
    })
  )
}

describe('CommunityMarkdown', () => {
  it('drops <script> tags and raw HTML instead of rendering them', () => {
    const html = render('Hi <script>alert(1)</script> <b onclick="x()">bold</b>\n\n<div><iframe src="https://evil.test"></iframe></div>')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<iframe/i)
    expect(html).not.toMatch(/<b[ >]/i)
    expect(html).not.toMatch(/onclick/i)
    expect(html).toContain('Hi')
  })

  it('empties javascript:, vbscript: and data: link targets', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>']) {
      const html = render(`[click](${href})`)
      expect(html, href).not.toMatch(/javascript:|vbscript:|data:/i)
    }
  })

  it('opens safe links in a new tab without leaking referrer or rank', () => {
    const html = render('[docs](https://example.com/a)')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="nofollow noopener noreferrer"')
  })

  it('never renders markdown images', () => {
    const html = render('![x](https://example.com/pixel.png) ![y](javascript:alert(1))')
    expect(html).not.toMatch(/<img/i)
  })

  it('demotes h1/h2 below the page headings', () => {
    const html = render('# Big\n\n## Medium')
    expect(html).not.toMatch(/<h1|<h2/)
    expect(html).toContain('<h3')
    expect(html).toContain('<h4')
  })

  it('keeps single newlines as line breaks, like the old plain-text posts', () => {
    const html = render('line one\nline two')
    expect(html).toMatch(/line one<br\/?>\s*line two/)
  })

  it('renders fenced code as a code block with a copy button, and inline code', () => {
    const html = render('Use `npm i`\n\n```js\nconst a = 1 < 2\n```')
    expect(html).toContain('data-language="js"')
    expect(html).toContain('aria-label="Copy code"')
    expect(html).toContain('<code')
    expect(html).toContain('const a = 1 &lt; 2')
  })

  it('renders GFM tables, lists and emphasis', () => {
    const html = render('**b** *i*\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<strong')
    expect(html).toContain('<em>')
    expect(html).toContain('<ul')
    expect(html).toContain('<table')
  })
})
