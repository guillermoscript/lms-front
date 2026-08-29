import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the Overview layout so nothing jumps when the data lands. */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Needs attention */}
      <div className="mb-8">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="flex items-center gap-3 rounded-lg border px-5 py-4">
          <Skeleton className="size-5 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-8 grid overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b px-5 py-4 last:border-b-0 lg:border-b-0 lg:not-last:border-r">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-20" />
          <div className="space-y-3 rounded-lg border px-5 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
