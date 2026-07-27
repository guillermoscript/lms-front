/**
 * Source-level normalization applied to `lessons.content` before it is compiled
 * as MDX.
 *
 * Kept in sync with `mcp-server/resources/shared/lesson/mdx.ts`, which does the
 * same work for the widget renderer — the two live in separate npm projects and
 * can not import each other, so `tests/unit/mcp-lesson-mdx.test.ts` asserts the
 * two implementations produce identical output.
 */

/**
 * Move `<CodeBlock>` bodies out of the children position and into a `code` prop.
 *
 * MDX parses a JSX element's children as MDX, so a snippet whose first line
 * starts at column 0 with `export` or `import` is read as an ESM statement and
 * handed to acorn — which then chokes on `</CodeBlock>` and fails the *whole
 * document*, dropping the student to the "content could not be rendered"
 * banner. Pasting a module into `<CodeBlock>` is the documented usage
 * (`components/lesson/mdx-components.tsx`), so this is the common case.
 *
 * `{expressions}` and `<tags>` inside a snippet break the same way. Rewriting
 * the body to `code={JSON.parse('…')}` — the escape hatch the block editor's
 * serializer already uses for complex props — makes the snippet opaque to the
 * parser, so none of them reach acorn. It also renders more faithfully: as
 * children, `**bold**` inside a snippet was parsed as markdown and the
 * asterisks were lost on the way to the `<pre>`.
 */
export function inlineCodeBlockBodies(source: string): string {
  return source.replace(
    /<CodeBlock(\s[^>]*?)?>([\s\S]*?)<\/CodeBlock>/g,
    (whole, rawAttributes: string | undefined, body: string) => {
      const attributes = rawAttributes ?? ''
      // Already prop-carried, or an empty block — nothing to move.
      if (/(^|\s)code\s*=/.test(attributes) || body.trim() === '') return whole

      // Drop the newline that follows the opening tag and the indentation that
      // precedes the closing one; both are layout, not part of the snippet.
      const code = body.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '')

      // JSON.stringify escapes everything acorn cares about except the single
      // quote wrapping the payload, which the MDX attribute expression needs.
      const payload = JSON.stringify(code).split("'").join("\\'")
      return `<CodeBlock${attributes} code={JSON.parse('${payload}')} />`
    }
  )
}
