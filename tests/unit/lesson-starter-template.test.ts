import { describe, it, expect } from 'vitest'
import {
  LESSON_STARTER_TEMPLATE,
  getLessonStarterTemplate,
  stripStarterPlaceholders,
} from '@/components/teacher/lesson-editor/starter-template'
import { blocksToMdx, mdxToBlocks } from '@/components/teacher/block-editor/serializer'

/**
 * #687 — a new lesson used to seed its content from `t('contentDefault')`.
 * next-intl rejected the `<Callout>` tag (INVALID_MESSAGE: INVALID_TAG) and the
 * editor opened on the bare translation key. The template is now a plain
 * constant, and the block parser must read it back as the intended blocks.
 */
describe('lesson starter template', () => {
  it.each(Object.keys(LESSON_STARTER_TEMPLATE) as Array<keyof typeof LESSON_STARTER_TEMPLATE>)(
    'parses the %s template into heading, text and callout blocks',
    (locale) => {
      const blocks = mdxToBlocks(LESSON_STARTER_TEMPLATE[locale])

      expect(blocks.map((b) => b.type)).toEqual(['heading', 'text', 'callout'])

      const [heading, text, callout] = blocks
      expect(heading.type === 'heading' && heading.content.trim()).toBeTruthy()
      expect(text.type === 'text' && text.content.trim()).toBeTruthy()
      expect(callout.type === 'callout' && callout.variant).toBe('info')
      expect(callout.type === 'callout' && callout.content.trim()).toBeTruthy()
    }
  )

  it('round-trips through the serializer unchanged', () => {
    for (const template of Object.values(LESSON_STARTER_TEMPLATE)) {
      expect(blocksToMdx(mdxToBlocks(template))).toBe(template)
    }
  })

  it('falls back to English for an unknown locale', () => {
    expect(getLessonStarterTemplate('fr')).toBe(LESSON_STARTER_TEMPLATE.en)
    expect(getLessonStarterTemplate('es')).toBe(LESSON_STARTER_TEMPLATE.es)
  })

  it('never contains an ICU brace that next-intl would try to interpolate', () => {
    for (const template of Object.values(LESSON_STARTER_TEMPLATE)) {
      expect(template).not.toMatch(/[{}]/)
    }
  })
})

describe('stripStarterPlaceholders (#730)', () => {
  it('strips a fully untouched template down to nothing, for every locale', () => {
    for (const template of Object.values(LESSON_STARTER_TEMPLATE)) {
      expect(stripStarterPlaceholders(template)).toBe('')
    }
  })

  it('keeps a block a creator added after the untouched starter blocks', () => {
    const content = `${LESSON_STARTER_TEMPLATE.en}\n\nHere is what I actually want to teach.`
    expect(stripStarterPlaceholders(content)).toBe('Here is what I actually want to teach.')
  })

  it('keeps a block a creator added before the untouched starter blocks', () => {
    const content = `Here is what I actually want to teach.\n\n${LESSON_STARTER_TEMPLATE.es}`
    expect(stripStarterPlaceholders(content)).toBe('Here is what I actually want to teach.')
  })

  it('keeps a block the creator edited, but still strips the ones left untouched', () => {
    const edited = [
      '# Photosynthesis',
      '',
      'Write the lesson content here...',
      '',
      '<Callout type="info">',
      'Add learning objectives here',
      '</Callout>',
    ].join('\n')
    // The heading was rewritten, so it no longer matches the placeholder and
    // survives. The body and callout are still byte-identical to the starter
    // template, so — like any other untouched starter block — they go.
    expect(stripStarterPlaceholders(edited)).toBe('# Photosynthesis')
  })

  it('is a no-op on content that never had a starter block', () => {
    const content = 'Some real content.\n\nA second paragraph.'
    expect(stripStarterPlaceholders(content)).toBe(content)
  })

  it('handles empty content without throwing', () => {
    expect(stripStarterPlaceholders('')).toBe('')
  })

  it('strips starter blocks regardless of which locale template they came from', () => {
    // A locale switch mid-edit (or a copy/paste) could land the other
    // locale's placeholder text in the document — still a placeholder.
    const content = `${LESSON_STARTER_TEMPLATE.es}\n\nMy real content.`
    expect(stripStarterPlaceholders(content)).toBe('My real content.')
  })
})

describe('mdxToBlocks callouts', () => {
  it('keeps the text of a one-line <Callout>text</Callout>', () => {
    const blocks = mdxToBlocks('<Callout type="warning">Mind the gap</Callout>')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'callout', variant: 'warning', content: 'Mind the gap' })
  })

  it('reads a self-closing <Callout /> as an empty callout', () => {
    const blocks = mdxToBlocks('<Callout type="success" />')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'callout', variant: 'success', content: '' })
  })

  it('still reads the multi-line form the serializer writes', () => {
    const blocks = mdxToBlocks('<Callout type="error">\nLine one\nLine two\n</Callout>\n\nAfter')
    expect(blocks.map((b) => b.type)).toEqual(['callout', 'text'])
    expect(blocks[0]).toMatchObject({ type: 'callout', variant: 'error', content: 'Line one\nLine two' })
  })
})
