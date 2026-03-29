import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8" role="status" aria-busy="true" aria-label="Loading templates">
      <span className="sr-only">Loading...</span>

      {/* Header with create button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>

      {/* Card with table */}
      <div className="rounded-xl border">
        <div className="p-6 space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <div className="px-6 pb-6">
          {/* Table header */}
          <div className="flex items-center gap-4 py-3 border-b">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <div className="flex gap-1">
                <Skeleton className="h-4 w-10 rounded-sm" />
                <Skeleton className="h-4 w-10 rounded-sm" />
              </div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
