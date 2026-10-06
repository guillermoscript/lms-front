import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading submissions"
      className="mx-auto container flex-none space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-6"
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border py-4">
            <div className="flex items-center justify-between px-4 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="px-4">
              <Skeleton className="h-8 w-12" />
            </div>
          </div>
        ))}
      </div>
      {/* Table card */}
      <div className="rounded-xl border p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
        <div className="divide-y rounded-md border">
          <div className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
