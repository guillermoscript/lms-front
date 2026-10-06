import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

// Mirrors exercises/page.tsx: container, breadcrumb, header + CTA, type chips, exercise rows.
export default function Loading() {
  return (
    <PageSkeleton
      label="Loading exercises"
      className="container mx-auto flex-none space-y-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-6"
    >
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex flex-1 items-center gap-4 rounded-xl border p-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-4 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
