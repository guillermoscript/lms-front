import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/admin/analytics/page.tsx: breadcrumb, header + period
 * buttons, revenue chart, user growth chart, engagement metrics, course
 * popularity chart. */
export default function Loading() {
  return (
    <div className="space-y-6 p-6 lg:p-8" aria-busy="true">
      {/* AdminBreadcrumb */}
      <Skeleton className="h-4 w-56" />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16" />
          ))}
        </div>
      </div>

      {/* Revenue chart */}
      <div className="space-y-3 rounded-lg border p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>

      {/* User growth chart */}
      <div className="space-y-3 rounded-lg border p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>

      {/* Engagement metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Course popularity chart */}
      <div className="space-y-3 rounded-lg border p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}
