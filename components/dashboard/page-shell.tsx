import type { ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconArrowLeft } from '@tabler/icons-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Teacher page shell. page.tsx and loading.tsx render the SAME PageShell +
 * PageHeader/PageHeaderSkeleton so the swap from skeleton to content does
 * not move anything. Do not hand-roll wrappers in teacher routes.
 */

export type PageShellVariant = 'default' | 'wide' | 'form' | 'reading'

/** Shared padding: 24px, 32px from lg. Same on every variant. */
const PAD = 'px-6 py-6 lg:px-8 lg:py-8'

export const PAGE_SHELL_CLASSES: Record<PageShellVariant, string> = {
  // Full-width lists/dashboards.
  default: `flex-1 space-y-6 ${PAD}`,
  // Centered, capped at the `container` breakpoint steps.
  wide: `flex-1 space-y-6 mx-auto w-full container ${PAD}`,
  // Forms and settings.
  form: `flex-1 space-y-6 mx-auto w-full max-w-4xl ${PAD}`,
  // Feeds, long-form reading.
  reading: `flex-1 space-y-6 mx-auto w-full max-w-3xl ${PAD}`,
}

export function PageShell({
  variant = 'default',
  skeleton = false,
  label: _label,
  className,
  children,
  ...rest
}: {
  variant?: PageShellVariant
  /** loading.tsx: adds status semantics + fade-in. Geometry is identical. */
  skeleton?: boolean
  label?: string
  className?: string
  children: ReactNode
} & Omit<React.ComponentProps<'div'>, 'className' | 'children'>) {
  const tc = useTranslations('common')
  return (
    <div
      {...rest}
      {...(skeleton
        ? { role: 'status', 'aria-busy': true, 'aria-live': 'polite' as const }
        : {})}
      className={cn(
        PAGE_SHELL_CLASSES[variant],
        skeleton && 'animate-in fade-in duration-300 motion-reduce:animate-none',
        className
      )}
    >
      {skeleton && <span className="sr-only">{tc('loading')}</span>}
      {children}
    </div>
  )
}

/** Single standard back affordance: labelled, text-sm, muted. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-6 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
    >
      <IconArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  )
}

// Fixed heights: back row 24px (+8 gap), title block 56px (32 title + 24 desc row).
const HEADER_MIN = 'min-h-14'

/**
 * Title row. Always reserves the title + description height, so a missing
 * description or late actions never change the row height.
 */
export function PageHeader({
  title,
  description,
  actions,
  badges,
  back,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Inline after the title (status badges). */
  badges?: ReactNode
  back?: { href: string; label: ReactNode }
  className?: string
}) {
  return (
    <header className={cn('space-y-2', className)}>
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
          HEADER_MIN
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {badges}
          </div>
          <p className="mt-0.5 min-h-5 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Mirrors PageHeader geometry exactly (same wrappers, same min-height). */
export function PageHeaderSkeleton({
  back = false,
  actions = 0,
  description = true,
  className,
}: {
  back?: boolean
  /** Number of action buttons to mimic (h-7 = Button default). */
  actions?: number
  description?: boolean
  className?: string
}) {
  return (
    <header className={cn('space-y-2', className)} aria-hidden="true">
      {back && <Skeleton className="h-6 w-28" />}
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
          HEADER_MIN
        )}
      >
        <div className="min-w-0">
          <div className="flex h-8 items-center">
            <Skeleton className="h-6 w-56 max-w-full" />
          </div>
          <div className="mt-0.5 flex min-h-5 items-center">
            {description && <Skeleton className="h-4 w-72 max-w-full" />}
          </div>
        </div>
        {actions > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {Array.from({ length: actions }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-28 rounded-md" />
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
