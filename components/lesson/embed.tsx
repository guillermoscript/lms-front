import { cn } from '@/lib/utils'

interface EmbedProps {
  url: string
  title?: string
  caption?: string
  className?: string
}

export function Embed({ url, title, caption, className }: EmbedProps) {
  return (
    <div className={cn('my-6', className)}>
      {title && (
        <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      )}
      <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
        <iframe
          src={url}
          className="h-full w-full"
          sandbox="allow-scripts allow-same-origin"
          title={title || 'Embedded content'}
        />
      </div>
      {caption && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  )
}
