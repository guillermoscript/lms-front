import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors platform/billing-health/page.tsx: PlatformPageHeader, plan
 * configuration section, plan-limit sweep status, 4-stat StatStrip, at-risk
 * schools table (7 columns). */
export default function Loading() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      {/* PlatformPageHeader */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* Plan configuration */}
      <div className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-32 rounded-full" />
        </div>
        <div className="flex items-start gap-3 rounded-lg border px-5 py-4">
          <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>

      {/* Plan-limit sweep */}
      <div className="mb-8">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* StatStrip */}
      <div className="mb-8 grid overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b px-5 py-4 last:border-b-0 lg:border-b-0 lg:not-last:border-r">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* At-risk schools */}
      <div>
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="divide-y rounded-lg border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
