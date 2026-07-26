import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  attributesToProps,
  parseLessonMdx,
  resolveExpression,
  type MdNode,
} from '@/mcp-server/resources/shared/lesson/mdx'
import { LessonBody } from '@/mcp-server/resources/shared/lesson'

/**
 * The MCP lesson widgets render `lessons.content` — an MDX source string — with
 * the same component set the web app hands to <MDXClient>. These tests cover the
 * two halves of that: resolving JSX attributes without a JS runtime, and the
 * rendered output for a document shaped like the block editor's serializer
 * output (`components/teacher/block-editor/serializer.ts`).
 */

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
}

function firstJsxElement(tree: MdNode | null): MdNode {
  const found: MdNode[] = []
  const walk = (node: MdNode) => {
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') found.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  if (tree) walk(tree)
  if (found.length === 0) throw new Error('no JSX element in tree')
  return found[0]
}

describe('resolveExpression', () => {
  it('unwraps the JSON.parse() form the block editor serializes', () => {
    expect(resolveExpression(`JSON.parse('[{"text":"A"},{"text":"B"}]')`)).toEqual([
      { text: 'A' },
      { text: 'B' },
    ])
  })

  it('restores single quotes the serializer escaped, leaving JSON escapes intact', () => {
    // escapeSingleQuotes() turns ' into \' so the payload can sit in '...'.
    const expression = String.raw`JSON.parse('["it\'s a \"quote\"","line\nbreak"]')`
    expect(resolveExpression(expression)).toEqual(['it\'s a "quote"', 'line\nbreak'])
  })

  it('resolves plain literal expressions', () => {
    expect(resolveExpression('0')).toBe(0)
    expect(resolveExpression('true')).toBe(true)
    expect(resolveExpression('[1, 2]')).toEqual([1, 2])
  })

  it('falls back to the raw text rather than throwing on anything it can not resolve', () => {
    expect(resolveExpression('someRuntimeVariable')).toBe('someRuntimeVariable')
    expect(resolveExpression(`JSON.parse('{not json}')`)).toBe(`JSON.parse('{not json}')`)
  })
})

describe('attributesToProps', () => {
  it('reads string, expression and bare attributes off a JSX element', () => {
    const tree = parseLessonMdx(
      `<Quiz question="What is 2+2?" options={JSON.parse('["3","4"]')} correctIndex={1} multiple />`
    )
    expect(attributesToProps(firstJsxElement(tree))).toEqual({
      question: 'What is 2+2?',
      options: ['3', '4'],
      correctIndex: 1,
      multiple: true,
    })
  })
})

describe('LessonBody', () => {
  const lesson = [
    '# Introduction',
    '',
    'Plain **markdown** with `inline code` and a [link](https://example.com).',
    '',
    '<Callout type="warning">Mind the gap.</Callout>',
    '',
    `<Quiz question="What is 2+2?" options={JSON.parse('[{"text":"3"},{"text":"4"}]')} correctIndex={1} explanation="Basic math" />`,
    '',
    '<Steps>',
    '  <Step title="First">Do this</Step>',
    '  <Step title="Second">Then that</Step>',
    '</Steps>',
    '',
    `<Table headers={JSON.parse('["Term","Meaning"]')} rows={JSON.parse('[["RLS","Row level security"]]')} striped={true} />`,
    '',
    '<Video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />',
    '',
    '<LessonCheckpoint checkpointId="3" />',
    '',
    '| Col |',
    '| --- |',
    '| Val |',
    '',
    '```ts title="app.ts"',
    'const answer = 4',
    '```',
    '',
  ].join('\n')

  const html = render(createElement(LessonBody, { content: lesson }))

  it('renders standard markdown', () => {
    expect(html).toContain('Introduction')
    expect(html).toContain('<strong')
    expect(html).toContain('https://example.com')
    // GFM table from markdown syntax
    expect(html).toContain('>Col<')
    expect(html).toContain('>Val<')
  })

  it('renders the custom MDX components instead of dropping them', () => {
    // A plain-markdown renderer strips JSX entirely — this is the regression
    // these widgets used to have.
    expect(html).toContain('Mind the gap.')
    expect(html).toContain('What is 2+2?')
    // The quiz explanation only appears after the student submits an answer.
    expect(html).not.toContain('Basic math')
    expect(html).toContain('Do this')
    expect(html).toContain('Then that')
    expect(html).toContain('Row level security')
  })

  it('numbers steps in order', () => {
    const numbers = [...html.matchAll(/border-violet-600[^>]*>(\d+)</g)].map((m) => m[1])
    expect(numbers).toEqual(['1', '2'])
  })

  it('embeds video by provider URL', () => {
    expect(html).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('renders fenced code with its language and title meta', () => {
    expect(html).toContain('const answer = 4')
    expect(html).toContain('app.ts')
  })

  it('marks inline checkpoints without pretending they can be answered here', () => {
    expect(html).toContain('Checkpoint')
    expect(html).toContain('Answer this checkpoint in the course')
  })

  it('keeps the text of unknown components rather than blanking the lesson', () => {
    const unknown = render(
      createElement(LessonBody, {
        content: '<SomeFutureComponent foo="bar">visible text</SomeFutureComponent>',
      })
    )
    expect(unknown).toContain('visible text')
  })

  it('degrades to the source text when the MDX does not parse', () => {
    // An unclosed JSX tag is the classic teacher-authored failure (serializer
    // escaping bugs produce it) — the web app shows a contentError banner.
    const broken = render(createElement(LessonBody, { content: '<Callout type="info">oops' }))
    expect(broken).toContain('could not be rendered fully')
    expect(broken).toContain('oops')
  })

  it('renders video and embed_code the way the lesson page orders them', () => {
    const withEmbed = render(
      createElement(LessonBody, {
        content: null,
        videoUrl: null,
        embedCode: '<div>widget</div>',
      })
    )
    expect(withEmbed).toContain('sandbox="allow-scripts allow-popups"')

    // A video hides the custom embed, exactly as lesson-content.tsx does.
    const withVideo = render(
      createElement(LessonBody, {
        content: null,
        videoUrl: 'https://vimeo.com/123456',
        embedCode: '<div>widget</div>',
      })
    )
    expect(withVideo).toContain('https://player.vimeo.com/video/123456')
    expect(withVideo).not.toContain('sandbox=')
  })

  it('shows the empty state only when there is nothing at all to render', () => {
    const empty = render(createElement(LessonBody, { content: null }))
    expect(empty).toContain('No content for this lesson yet.')
  })
})
