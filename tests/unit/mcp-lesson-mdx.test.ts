import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  attributesToProps,
  inlineCodeBlockBodies,
  parseLessonBlocks,
  parseLessonMdx,
  resolveExpression,
  type MdNode,
} from '@/mcp-server/resources/shared/lesson/mdx'
import { LessonBody } from '@/mcp-server/resources/shared/lesson'
import { inlineCodeBlockBodies as inlineCodeBlockBodiesApp } from '@/lib/lesson/mdx-source'

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

describe('inlineCodeBlockBodies', () => {
  // `<CodeBlock>` children are parsed as MDX, so a snippet starting at column 0
  // with export/import was handed to acorn and failed the WHOLE document (#566).
  const MODULE_IN_CODEBLOCK = [
    'Before.',
    '',
    '<CodeBlock language="tsx" title="counter.tsx">',
    'export function Counter() {',
    '  const [n, setN] = useState(0)',
    '  return <button onClick={() => setN(n + 1)}>{n}</button>',
    '}',
    '</CodeBlock>',
    '',
    'After.',
  ].join('\n')

  it('makes a module inside <CodeBlock> parse instead of failing the document', () => {
    expect(parseLessonMdx(MODULE_IN_CODEBLOCK)).toBeNull()
    expect(parseLessonMdx(inlineCodeBlockBodies(MODULE_IN_CODEBLOCK))).not.toBeNull()
  })

  it('round-trips the snippet byte for byte, quotes and backslashes included', () => {
    const source = `<CodeBlock>const s = 'it\\'s'\nconst re = /\\d+/\n</CodeBlock>`
    const element = firstJsxElement(parseLessonMdx(inlineCodeBlockBodies(source)))
    expect(attributesToProps(element).code).toBe(`const s = 'it\\'s'\nconst re = /\\d+/`)
  })

  it('leaves blocks it has nothing to move alone', () => {
    const selfClosing = '<CodeBlock language="ts" code={JSON.parse(\'"a"\')} />'
    expect(inlineCodeBlockBodies(selfClosing)).toBe(selfClosing)
    expect(inlineCodeBlockBodies('<CodeBlock language="ts"></CodeBlock>')).toBe(
      '<CodeBlock language="ts"></CodeBlock>'
    )
    expect(inlineCodeBlockBodies('no code blocks here')).toBe('no code blocks here')
  })

  it('is byte-identical to the web app copy in lib/lesson/mdx-source.ts', () => {
    // The two renderers live in separate npm projects and can not import each
    // other, so the only thing keeping the ports honest is this assertion.
    for (const source of [
      MODULE_IN_CODEBLOCK,
      '<CodeBlock>a</CodeBlock>',
      `<CodeBlock lang="js">const x = {a: 1}\nif (x) console.log('hi')</CodeBlock>`,
      '<CodeBlock language="ts"></CodeBlock>',
      'plain text',
      '<CodeBlock>one</CodeBlock>\n\n<CodeBlock>two</CodeBlock>',
    ]) {
      expect(inlineCodeBlockBodies(source)).toBe(inlineCodeBlockBodiesApp(source))
    }
  })
})

describe('parseLessonBlocks', () => {
  it('keeps a parseable lesson as a single block', () => {
    const blocks = parseLessonBlocks('# Title\n\nSome **text**.')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tree).not.toBeNull()
  })

  it('degrades only the block that can not be parsed', () => {
    const blocks = parseLessonBlocks(
      ['Intro.', '', '<Callout type="info">never closed', '', 'Outro.'].join('\n')
    )
    expect(blocks.map((block) => block.tree !== null)).toEqual([true, false, true])
    expect(blocks[1].source).toContain('never closed')
  })

  it('re-joins segments until a multi-line element closes', () => {
    // <Steps> alone is a parse error ("Expected a closing tag"), so the blank
    // lines inside it must not become block boundaries.
    const blocks = parseLessonBlocks(
      [
        '<Callout>unclosed', // forces the per-block path
        '',
        '<Steps>',
        '',
        '  <Step title="One">a</Step>',
        '',
        '</Steps>',
      ].join('\n')
    )
    const parsed = blocks.filter((block) => block.tree)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].source).toContain('</Steps>')
  })

  it('does not split inside a fenced code block', () => {
    // An unterminated fence parses happily to end-of-input, so a bad split here
    // would silently swallow the rest of the lesson rather than erroring.
    const blocks = parseLessonBlocks(
      ['<Callout>unclosed', '', '```ts', 'const a = 1', '', 'const b = 2', '```'].join('\n')
    )
    const fenced = blocks.find((block) => block.source.startsWith('```'))
    expect(fenced?.source).toContain('const b = 2')
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

  it('numbers steps by position, not by a counter bumped while rendering', () => {
    const stepped = [
      '<Steps>',
      '  <Step title="One">a</Step>',
      '  <Step title="Two">b</Step>',
      '  <Step title="Three">c</Step>',
      '</Steps>',
    ].join('\n')
    // The step marker is the only element carrying the brand border colour.
    // It was `border-violet-600` until widgets moved to the tenant brand ramp
    // (`--brand-*`), so this selector tracks the accent, not a fixed hue.
    const numbersIn = (markup: string) =>
      [...markup.matchAll(/border-\[var\(--brand-600\)\][^>]*>(\d+)</g)].map((m) => m[1])

    // Rendering the same content twice must not drift: a counter incremented
    // during render double-counts under React's development double-invoke and
    // produces 1, 3, 5 in the browser.
    const first = render(createElement(LessonBody, { content: stepped }))
    const second = render(createElement(LessonBody, { content: stepped }))
    expect(numbersIn(first)).toEqual(['1', '2', '3'])
    expect(numbersIn(second)).toEqual(['1', '2', '3'])
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

  it('renders a module pasted into <CodeBlock> instead of dumping the lesson (#566)', () => {
    const withModule = render(
      createElement(LessonBody, {
        content: [
          '# Counter',
          '',
          '<CodeBlock language="tsx" title="counter.tsx">',
          'export function Counter() {',
          '  return <button>{n}</button>',
          '}',
          '</CodeBlock>',
          '',
          'Explanation **after** the snippet.',
        ].join('\n'),
      })
    )

    expect(withModule).not.toContain('could not be rendered')
    expect(withModule).toContain('export function Counter')
    expect(withModule).toContain('counter.tsx')
    // The prose after the snippet still renders as markdown, not as raw source.
    expect(withModule).toContain('<strong')
  })

  it('keeps a snippet literal rather than parsing it as markdown', () => {
    // As children, `**bold**` was parsed as markdown and the asterisks were
    // lost on the way to the <pre>.
    const literal = render(
      createElement(LessonBody, { content: '<CodeBlock>a = "**not bold**"</CodeBlock>' })
    )
    expect(literal).toContain('**not bold**')
  })

  it('degrades one broken block and renders the rest of the lesson (#566)', () => {
    const partly = render(
      createElement(LessonBody, {
        content: [
          '# Still here',
          '',
          '<Callout type="warning">this tag never closes',
          '',
          'And this paragraph must still render.',
        ].join('\n'),
      })
    )

    expect(partly).toContain('This part of the lesson could not be rendered')
    expect(partly).not.toContain('could not be rendered fully')
    expect(partly).toContain('Still here')
    expect(partly).toContain('And this paragraph must still render.')
  })

  it('always offers a link out of an embedded video (#566)', () => {
    // Widget hosts refuse to frame YouTube/Vimeo, and there is no reliable load
    // event inside the sandbox — so a blocked player must never be a bare void.
    const embedded = render(
      createElement(LessonBody, {
        content: null,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
    )
    expect(embedded).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(embedded).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"')

    // Same for a <Video> authored inside the lesson body.
    const authored = render(
      createElement(LessonBody, {
        content: '<Video url="https://vimeo.com/123456" />',
      })
    )
    expect(authored).toContain('https://player.vimeo.com/video/123456')
    expect(authored).toContain('href="https://vimeo.com/123456"')
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
