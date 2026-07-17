import { serialize } from 'next-mdx-remote-client/serialize'
import type { SerializeResult } from 'next-mdx-remote-client'
import remarkGfm from 'remark-gfm'

/**
 * Compiles lesson MDX on the server so the client only renders the
 * precompiled source (no in-browser compiler, no loading skeleton).
 */
export async function serializeLessonMdx(
  content: string | null
): Promise<SerializeResult | null> {
  if (!content) return null
  try {
    return await serialize({
      source: content,
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          development: process.env.NODE_ENV === 'development',
        },
      },
    })
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error('Failed to compile MDX'),
      frontmatter: {},
      scope: {},
    } as SerializeResult
  }
}
