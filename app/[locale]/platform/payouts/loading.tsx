import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors platform/payouts/page.tsx: PlatformPageHeader, 3-stat StatStrip,
 * one wide by-tenant table (10 columns). */
export default function Loading() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      {/* PlatformPageHeader */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* StatStrip */}
      <div className="mb-8 grid overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b px-5 py-4 last:border-b-0 lg:border-b-0 lg:not-last:border-r">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* By-tenant table */}
      <div>
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="divide-y rounded-lg border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
