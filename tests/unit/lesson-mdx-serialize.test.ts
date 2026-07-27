import { describe, it, expect } from 'vitest'
import { serializeLessonMdx } from '@/app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/serialize-lesson'

/**
 * The web app half of #566.
 *
 * `serializeLessonMdx()` compiles `lessons.content` with the same MDX parser the
 * widget renderer uses, so it failed on the same input: a snippet pasted into
 * `<CodeBlock>` whose first line starts at column 0 with `export`/`import` was
 * read as an ESM statement, and the compile error dropped the student to the
 * contentError banner with no lesson at all.
 */
describe('serializeLessonMdx', () => {
  const compiled = (result: unknown) => result as { error?: Error; compiledSource?: string }

  it('compiles a module pasted into <CodeBlock>', async () => {
    const result = compiled(
      await serializeLessonMdx(
        [
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
      )
    )

    expect(result.error).toBeUndefined()
    expect(result.compiledSource).toContain('export function Counter')
  })

  it('compiles an import-first snippet', async () => {
    const result = compiled(
      await serializeLessonMdx(
        `<CodeBlock language="ts">\nimport { createClient } from '@supabase/supabase-js'\n</CodeBlock>`
      )
    )
    expect(result.error).toBeUndefined()
  })

  it('still compiles ordinary lesson content', async () => {
    const result = compiled(
      await serializeLessonMdx(
        ['# Title', '', '<Callout type="tip">ok</Callout>', '', '```ts', 'const a = 1', '```'].join(
          '\n'
        )
      )
    )
    expect(result.error).toBeUndefined()
  })

  it('still reports a genuinely broken document instead of throwing', async () => {
    // `error` is remark's own VFileMessage, which is Error-shaped but not an
    // instance of this realm's Error — the page only reads `.message`.
    const result = compiled(await serializeLessonMdx('<Callout type="info">never closed'))
    expect(result.error?.message).toContain('closing tag')
  })

  it('returns null for empty content', async () => {
    expect(await serializeLessonMdx(null)).toBeNull()
  })
})
