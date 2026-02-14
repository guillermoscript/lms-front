'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface LessonContentProps {
  content: string | null
  videoUrl: string | null
  embedCode: string | null
}

export function LessonContent({ content, videoUrl, embedCode }: LessonContentProps) {
  // Extract YouTube video ID if it's a YouTube URL
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  }

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null

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

      {/* Markdown content */}
      {content && (
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-pre:bg-muted prose-pre:border prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
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
