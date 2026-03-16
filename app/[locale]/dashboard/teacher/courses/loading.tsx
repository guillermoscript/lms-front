import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8" role="status" aria-busy="true" aria-label="Loading courses">
      <span className="sr-only">Loading...</span>

      {/* Header with create button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* Search and filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
        <Skeleton className="h-8 w-64 rounded-md" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* Course cards grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border overflow-hidden">
            {/* Thumbnail */}
            <Skeleton className="aspect-video w-full" />
            {/* Title and description */}
            <div className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1 py-3 border-y">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex flex-col items-center gap-1">
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-2 w-12" />
                  </div>
                ))}
              </div>
              {/* Action buttons */}
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 flex-1 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
