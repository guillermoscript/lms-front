'use client'

import { MDXClient, type SerializeResult } from 'next-mdx-remote-client'
import { useState, useEffect } from 'react'
import { lessonMdxComponents } from '@/components/lesson/mdx-components'
import { IconPlayerPlay } from '@tabler/icons-react'

interface LessonContentProps {
  content: string | null
  videoUrl: string | null
  embedCode: string | null
}

export function LessonContent({ content, videoUrl, embedCode }: LessonContentProps) {
  const [mdxResult, setMdxResult] = useState<SerializeResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const getEmbedUrl = (url: string): string | null => {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return null
  }

  const videoEmbedUrl = videoUrl ? getEmbedUrl(videoUrl) : null

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

  const hasError = mdxResult && 'error' in mdxResult
  const hasCompiledSource = mdxResult && 'compiledSource' in mdxResult

  return (
    <div className="space-y-8">
      {/* Video embed */}
      {videoEmbedUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-white/10">
          <iframe
            src={videoEmbedUrl}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      {/* Custom embed code */}
      {embedCode && !videoEmbedUrl && (
        <div
          className="aspect-video w-full overflow-hidden rounded-xl shadow-lg"
          dangerouslySetInnerHTML={{ __html: embedCode }}
        />
      )}

      {/* MDX content */}
      {content && (
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-xl sm:prose-h1:text-2xl prose-h2:text-lg sm:prose-h2:text-xl prose-h3:text-base sm:prose-h3:text-lg prose-p:leading-[1.8] prose-p:text-foreground/80 prose-li:text-foreground/80 prose-pre:bg-[#1e1e2e] prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl prose-pre:shadow-md prose-pre:overflow-x-auto prose-pre:text-[13px] sm:prose-pre:text-sm prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] sm:prose-code:text-sm prose-code:font-medium prose-img:rounded-xl prose-img:shadow-lg prose-img:max-w-full prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-hr:border-border [&_table]:block [&_table]:overflow-x-auto">
          {isLoading && (
            <div className="space-y-4 py-2">
              <div className="h-4 bg-muted rounded-lg w-4/5 animate-pulse" />
              <div className="h-4 bg-muted rounded-lg w-3/5 animate-pulse" />
              <div className="h-4 bg-muted rounded-lg w-4/6 animate-pulse" />
              <div className="h-20 bg-muted rounded-xl w-full animate-pulse mt-4" />
              <div className="h-4 bg-muted rounded-lg w-2/3 animate-pulse" />
            </div>
          )}

          {hasError && mdxResult && 'error' in mdxResult && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
              <p className="font-semibold text-sm">Error loading content</p>
              <p className="text-xs mt-1 opacity-80">{mdxResult.error.message}</p>
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

      {!content && !videoEmbedUrl && !embedCode && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
            <IconPlayerPlay className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            No content available for this lesson.
          </p>
        </div>
      )}
    </div>
  )
}
