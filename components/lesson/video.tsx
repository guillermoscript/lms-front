import { cn } from '@/lib/utils'
import { getEmbedUrl, VIDEO_IFRAME_ALLOW } from '@/lib/video/embed'

interface VideoProps {
  url: string
  title?: string
  className?: string
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
          allow={VIDEO_IFRAME_ALLOW}
          title={title || 'Video'}
        />
      </div>
    </div>
  )
}
