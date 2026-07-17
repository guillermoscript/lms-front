import { cn } from '@/lib/utils'

interface VideoProps {
  url: string
  title?: string
  className?: string
}

/**
 * Extract embed URL from a YouTube or Vimeo URL.
 * Returns null if the URL is not recognized.
 */
function getEmbedUrl(url: string): string | null {
  if (!url) return null

  // YouTube: https://www.youtube.com/watch?v=ID or https://youtu.be/ID
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`
  }

  // Vimeo: https://vimeo.com/ID or https://vimeo.com/channels/staffpicks/ID
  const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  return null
}

export function Video({ url, title, className }: VideoProps) {
  const embedUrl = getEmbedUrl(url)

  if (!embedUrl) {
    return (
      <div className={cn('my-6 rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground', className)}>
        Unable to load video.{' '}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            Open link
          </a>
        )}
      </div>
    )
  }

  return (
    <div className={cn('my-6', className)}>
      {title && (
        <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      )}
      <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
        <iframe
          src={embedUrl}
          className="h-full w-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          title={title || 'Video'}
        />
      </div>
    </div>
  )
}
