import { cn } from '@/lib/utils'
import { IconVolume } from '@tabler/icons-react'

interface AudioProps {
  src: string
  title?: string
  className?: string
}

export function Audio({ src, title, className }: AudioProps) {
  return (
    <div
      className={cn(
        'my-4 rounded-lg border bg-card p-4',
        className
      )}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <IconVolume className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
      )}
      <audio controls className="w-full" src={src}>
        Your browser does not support the audio element.
      </audio>
    </div>
  )
}
