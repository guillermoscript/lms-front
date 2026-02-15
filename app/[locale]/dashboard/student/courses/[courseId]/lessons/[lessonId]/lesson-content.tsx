'use client'

import { MDXClient, type SerializeResult } from 'next-mdx-remote-client'
import { useState, useEffect } from 'react'
import { lessonMdxComponents } from '@/components/lesson/mdx-components'

interface LessonContentProps {
  content: string | null
  videoUrl: string | null
  embedCode: string | null
}

export function LessonContent({ content, videoUrl, embedCode }: LessonContentProps) {
  const [mdxResult, setMdxResult] = useState<SerializeResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Extract YouTube video ID if it's a YouTube URL
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  }

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null

  // Compile MDX content on client
  useEffect(() => {
    if (!content) {
      setMdxResult(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    async function compileMDX() {
      try {
        const { serialize } = await import('next-mdx-remote-client/serialize')
        const result = await serialize({
          source: content!,
          options: {
            mdxOptions: {
              development: process.env.NODE_ENV === 'development',
            },
          },
        })

        if (!cancelled) {
          setMdxResult(result)
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('MDX compilation error:', err)
          // Create a result with error
          setMdxResult({
            error: err instanceof Error ? err : new Error('Failed to compile MDX'),
            frontmatter: {},
            scope: {},
          })
          setIsLoading(false)
        }
      }
    }

    compileMDX()

    return () => {
      cancelled = true
    }
  }, [content])

  // Check if result has error
  const hasError = mdxResult && 'error' in mdxResult
  const hasCompiledSource = mdxResult && 'compiledSource' in mdxResult

  return (
    <div className="space-y-8">
      {/* Video embed */}
      {youtubeId && (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      {/* Custom embed code */}
      {embedCode && !youtubeId && (
        <div
          className="aspect-video w-full overflow-hidden rounded-lg"
          dangerouslySetInnerHTML={{ __html: embedCode }}
        />
      )}

      {/* MDX content */}
      {content && (
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
          {isLoading && (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-5/6" />
            </div>
          )}

          {hasError && mdxResult && 'error' in mdxResult && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">Error loading content</p>
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
        </article>
      )}

      {!content && !videoUrl && !embedCode && (
        <div className="rounded-lg border bg-muted/50 p-8 text-center">
          <p className="text-muted-foreground">
            No content available for this lesson.
          </p>
        </div>
      )}
    </div>
  )
}
