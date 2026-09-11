import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors platform/revenue/page.tsx: PlatformPageHeader, 4-stat StatStrip,
 * fees-by-month bar list + by-provider table, by-school table. */
export default function Loading() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      {/* PlatformPageHeader */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* StatStrip */}
      <div className="mb-8 grid overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b px-5 py-4 last:border-b-0 lg:border-b-0 lg:not-last:border-r">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Fees by month */}
        <div>
          <Skeleton className="mb-3 h-4 w-40" />
          <div className="space-y-3 rounded-lg border px-5 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </div>

        {/* By provider */}
        <div>
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By school */}
      <div className="mt-8">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="divide-y rounded-lg border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
