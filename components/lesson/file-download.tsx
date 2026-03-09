import { cn } from '@/lib/utils'
import { IconFileDownload } from '@tabler/icons-react'

interface FileDownloadProps {
  url: string
  filename: string
  description?: string
  className?: string
}

export function FileDownload({ url, filename, description, className }: FileDownloadProps) {
  return (
    <div
      className={cn(
        'my-4 flex items-center gap-4 rounded-lg border bg-card p-4',
        className
      )}
    >
      <IconFileDownload className="size-8 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{filename}</p>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <a
        href={url}
        download={filename}
        className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Download
      </a>
    </div>
  )
}
