import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { Render, type Data, type Config } from '@measured/puck'
import { puckConfig } from '@/lib/puck/config'
import { accentVars } from '@/lib/puck/utils/accent-color'
import { ROOT_ZONE, applyOps, emptyPage, pageCatalog } from '@lms/core'
import messages from '@/messages/en.json'

/** An AI `add` op, applied the way the editor and MCP apply it (defaultProps merged first). */
function aiAddImage(props: Record<string, unknown>) {
  const { data } = applyOps(emptyPage(), [{ op: 'add', id: 'image', type: 'Image', zone: ROOT_ZONE, index: 0, props }], pageCatalog)
  return data.content[0].props as Record<string, unknown>
}

function renderBlocks(content: Data['content']) {
  const children = createElement<{ config: Config; data: Data }>(Render<Config>, {
    config: puckConfig,
    data: { root: { props: {} }, content },
  })
  // next-intl requires children in its props type for createElement.
  // eslint-disable-next-line react/no-children-prop
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: 'en', messages, children,
  }))
}

describe('school defaults and saved page overrides', () => {
  it('old blocks missing corners inherit the school; explicit saved corners and shadows survive', () => {
    const inherited = renderBlocks([{ type: 'Card', props: { id: 'old-card' } }])
    expect(inherited).toContain('rounded-card')
    expect(inherited).toContain('shadow-none')
    const overridden = renderBlocks([{ type: 'Card', props: { id: 'custom-card', borderRadius: '1rem', shadow: 'lg' } }])
    expect(overridden).toContain('rounded-2xl')
    expect(overridden).toContain('shadow-lg')
    expect(overridden).not.toContain('hover:shadow')
  })

  it('AI-added blocks inherit school corners and preserve requested overrides', () => {
    expect(aiAddImage({ src: '/image.jpg' }).borderRadius).toBe('school')
    expect(aiAddImage({ src: '/image.jpg', borderRadius: '0' }).borderRadius).toBe('0')
  })

  it('uses readable school text independently from the filled brand accent', () => {
    expect(accentVars()).toMatchObject({'--block-accent':'var(--primary)', '--block-accent-text':'var(--brand-text)'})
    expect(accentVars('#fcedb2')).toMatchObject({'--block-accent':'#fcedb2','--block-accent-text':'#fcedb2'})
    expect(accentVars('#fcedb2')['--block-accent-foreground' as keyof ReturnType<typeof accentVars>]).toBeTruthy()
  })

  it('saved CTA buttons render semantic links rather than nested interactive controls', () => {
    const html = renderBlocks([{type:'ButtonBlock',props:{...puckConfig.components.ButtonBlock.defaultProps,id:'cta',href:'/courses',color:'#fcedb2'}}])
    expect(html).toContain('href="/courses"')
    expect(html).toContain('rounded-button')
    expect(html).not.toContain('<button')
    expect(html).toContain('background-color:#fcedb2')
  })

  it('repeated contact blocks have distinct, correctly associated labels', () => {
    const html = renderBlocks([0,1].map(i=>({type:'ContactForm',props:{...puckConfig.components.ContactForm.defaultProps,id:`contact-${i}`}})))
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match=>match[1])
    expect(ids.length).toBe(6)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(html).toContain(`for="${id}"`)
  })
})
