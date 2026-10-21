import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroBlock } from '@/lib/puck/components/lms/hero-block'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    (HeroBlock.render as unknown as (p: Record<string, unknown>) => React.ReactElement)({
      ...HeroBlock.defaultProps,
      title: 'Hello',
      ...props,
    })
  )

describe('HeroBlock surface, pattern and card', () => {
  it('keeps the brand accent surface by default', () => {
    const html = render({})
    expect(html).toContain('bg-[var(--block-accent)]')
    expect(html).not.toContain('bg-background')
  })

  it('paints the theme surface and a grid pattern, with the card beside the copy', () => {
    const html = render({
      surface: 'theme',
      pattern: 'grid',
      cardTitle: 'lab',
      cardLines: [
        { kind: 'prompt', text: 'rol: analista' },
        { kind: 'reply', text: 'listo' },
      ],
    })
    expect(html).toContain('bg-background text-foreground')
    expect(html).toContain('linear-gradient')
    expect(html).toContain('lg:grid-cols-2')
    expect(html).toContain('rol: analista')
    expect(html).toContain('listo')
  })

  it('skips the card when no line has text', () => {
    const html = render({ cardLines: [{ kind: 'prompt', text: '' }] })
    expect(html).not.toContain('lg:grid-cols-2')
  })
})
