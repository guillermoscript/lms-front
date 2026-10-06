import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Shared building blocks for route `loading.tsx` files. Every block reserves
 * the same height/aspect as the real UI so content swaps in without layout shift.
 * Keep dimensions in sync with the components they mimic.
 */

/** Page wrapper: a11y status semantics + staggered fade-in so fast loads don't flash. */
export function PageSkeleton({
  label = "Loading",
  className,
  children,
}: {
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "flex-1 space-y-6 p-6 lg:p-8 animate-in fade-in duration-300 motion-reduce:animate-none",
        className
      )}
    >
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  )
}

/** Title + subtitle (+ optional action button on the right). */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-32 rounded-md" />}
    </div>
  )
}

/** Row of stat tiles (icon + number + label). */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Course card: 16:9 thumbnail + title + meta + progress/CTA. */
export function CourseCardSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    </div>
  )
}

export function CardGridSkeleton({
  count = 6,
  className = "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <CourseCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Table/list: header row + N rows. */
export function ListSkeleton({ rows = 6, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="rounded-xl border divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          {avatar && <Skeleton className="h-10 w-10 rounded-full shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Tab strip / filter pills. */
export function TabsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24 rounded-md" />
      ))}
    </div>
  )
}
