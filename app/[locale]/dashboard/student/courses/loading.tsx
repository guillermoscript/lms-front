import { Skeleton } from '@/components/ui/skeleton'
import { PageSkeleton } from '@/components/skeletons'

export default function MyCoursesLoading() {
  return (
    <PageSkeleton
      label="Loading courses"
      className="flex-none mx-auto container py-5 sm:py-8 px-4 lg:px-8 space-y-5 sm:space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-7 sm:h-8 w-40" />
          <Skeleton className="h-5 w-56 mt-1" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="space-y-4">
        {/* Status pills */}
        <div className="flex items-center gap-1.5 overflow-hidden pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 sm:h-9 w-28 rounded-full shrink-0" />
          ))}
        </div>
        {/* Search + sort */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="h-10 flex-1 sm:max-w-sm rounded-xl" />
          <Skeleton className="h-10 w-11 sm:w-36 rounded-xl" />
        </div>
      </div>

      {/* Enrolled course cards */}
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col sm:flex-row overflow-hidden rounded-2xl border bg-card">
            <Skeleton className="w-full sm:w-48 md:w-56 shrink-0 aspect-[16/9] sm:aspect-auto sm:min-h-[140px] rounded-none" />
            <div className="flex-1 flex flex-col p-4 sm:p-5 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
              </div>
              <div className="mt-auto space-y-2.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <div className="flex items-center justify-end mt-3 pt-3 border-t border-border/50">
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  )
}
