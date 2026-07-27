'use client'

import { MDXClient, type SerializeResult } from 'next-mdx-remote-client'
import { useState, useEffect } from 'react'
import { lessonMdxComponents } from '@/components/lesson/mdx-components'
import { inlineCodeBlockBodies } from '@/lib/lesson/mdx-source'

interface MDXPreviewProps {
    content: string
}

export function MDXPreview({ content }: MDXPreviewProps) {
    // The compiled output is tagged with the source it came from, so "still
    // compiling" and "nothing to compile" are derived rather than tracked in
    // their own state — setting state synchronously in the effect body would
    // cascade a render on every keystroke.
    const [compiled, setCompiled] = useState<{
        source: string
        result: SerializeResult
    } | null>(null)

    // Compile MDX content on client
    useEffect(() => {
        if (!content) return

        let cancelled = false

        async function compileMDX() {
            try {
                const { serialize } = await import('next-mdx-remote-client/serialize')
                const result = await serialize({
                    // Same normalization the student page applies, so the
                    // preview compiles exactly what they will see.
                    source: inlineCodeBlockBodies(content),
                    options: {
                        mdxOptions: {
                            development: process.env.NODE_ENV === 'development',
                        },
                    },
                })

                if (!cancelled) setCompiled({ source: content, result })
            } catch (err) {
                if (!cancelled) {
                    console.error('MDX compilation error:', err)
                    // Create a result with error
                    setCompiled({
                        source: content,
                        result: {
                            error: err instanceof Error ? err : new Error('Failed to compile MDX'),
                            frontmatter: {},
                            scope: {},
                        },
                    })
                }
            }
        }

        compileMDX()

        return () => {
            cancelled = true
        }
    }, [content])

    const mdxResult = content && compiled?.source === content ? compiled.result : null
    const isLoading = Boolean(content) && mdxResult === null

    // Check if result has error
    const hasError = mdxResult && 'error' in mdxResult
    const hasCompiledSource = mdxResult && 'compiledSource' in mdxResult

    return (
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
            {isLoading && (
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                </div>
            )}

            {hasError && mdxResult && 'error' in mdxResult && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                    <p className="font-medium">Error loading preview</p>
                    <p className="text-sm mt-1">{mdxResult.error.message}</p>
                </div>
            )}

            {hasCompiledSource && mdxResult && 'compiledSource' in mdxResult && (
                <MDXClient
                    compiledSource={mdxResult.compiledSource}
                    scope={mdxResult.scope}
                    components={lessonMdxComponents}
                />
            )}
        </div>
    )
}
