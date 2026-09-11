import { describe, it, expect } from 'vitest'
import {
  LESSON_STARTER_TEMPLATE,
  getLessonStarterTemplate,
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
