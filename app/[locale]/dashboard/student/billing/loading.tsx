import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/student/billing/page.tsx: header w/ icon + title,
 * active-subscription card, purchase-history table, offline requests table. */
export default function Loading() {
  return (
    <div className="container mx-auto max-w-4xl space-y-8 px-4 py-8" aria-busy="true">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      {/* Active subscription */}
      <div>
        <Skeleton className="mb-3 h-3 w-32" />
        <div className="rounded-xl border p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full max-w-xs" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Purchase history */}
      <div>
        <Skeleton className="mb-3 h-3 w-36" />
        <div className="rounded-xl border">
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Offline / manual payment requests */}
      <div>
        <Skeleton className="mb-3 h-3 w-40" />
        <div className="rounded-xl border">
          <div className="divide-y">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
