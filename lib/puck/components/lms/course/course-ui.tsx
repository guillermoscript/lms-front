/**
 * Small shared pieces for the data-bound course blocks: the editor-only
 * binding notice, a star rating, and an author avatar. Theme tokens only.
 */
import { IconInfoCircle, IconStarFilled } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * The neutral notice a data-bound block shows IN THE EDITOR when its binding
 * is unset, missing or a draft. Public renders never show it — they render
 * nothing instead (see `binding.ts`).
 */
export function BindingNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="px-6 py-8">
      <div
        role="note"
        className="mx-auto flex max-w-screen-md items-start gap-3 rounded-card border border-dashed border-border bg-muted/40 px-5 py-4 text-left"
      >
        <IconInfoCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

/** Five stars, filled to the rounded rating; the number itself is the accessible text. */
export function Stars({ rating, label, className }: { rating: number; label: string; className?: string }) {
  const filled = Math.round(rating)
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <IconStarFilled key={i} className={cn('size-3.5', i < filled ? 'text-warning' : 'text-muted-foreground/30')} />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Avatar image, or the person's initials on a muted disc. Never a stock face. */
export function AuthorAvatar({ name, src, size = 'sm' }: { name: string; src: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'size-20 text-xl' : 'size-8 text-xs'
  if (src) {
    return <img src={src} alt="" className={cn(box, 'shrink-0 rounded-full object-cover')} />
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span aria-hidden="true" className={cn(box, 'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground')}>
      {initials}
    </span>
  )
}
