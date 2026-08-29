import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Plans are categorical, not ranked by colour — one neutral treatment, the free tier quieter. */
export function PlanBadge({ plan, className }: { plan: string | null | undefined; className?: string }) {
  const value = plan || 'free'
  return (
    <Badge
      variant={value === 'free' ? 'secondary' : 'outline'}
      className={cn('capitalize', className)}
    >
      {value}
    </Badge>
  )
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted'

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  muted: 'bg-muted-foreground/50',
}

/**
 * Status as a dot + word. The word carries the meaning (WCAG 1.4.1); the dot
 * lets a scanning eye find the red rows in a long list.
 */
export function StatusDot({
  tone,
  label,
  className,
  ...props
}: { tone: Tone; label: string; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs capitalize', className)} {...props}>
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      {label}
    </span>
  )
}

export function tenantStatusTone(status: string | null | undefined): Tone {
  if (status === 'active') return 'ok'
  if (status === 'suspended') return 'bad'
  return 'muted'
}

export function billingStatusTone(status: string | null | undefined): Tone {
  if (!status || status === 'active' || status === 'trialing') return 'ok'
  if (status === 'past_due') return 'bad'
  if (status === 'free' || status === 'canceled' || status === 'cancelled') return 'muted'
  return 'warn'
}
