import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading progress"
      className="space-y-0 container mx-auto p-0 lg:p-0 py-8 px-4 lg:py-8 lg:px-4"
    >
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="size-6 rounded" />
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-6 w-72 max-w-full" />
      </div>

      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-card bg-card py-4 ring-1 ring-foreground/10">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="mt-2 h-9 w-14" />
                </div>
                <Skeleton className="size-10 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Per-course progress */}
        <div className="rounded-card bg-card py-4 ring-1 ring-foreground/10 flex flex-col gap-4">
          <div className="px-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="px-4 space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-56 max-w-full" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-2 flex-1 rounded-full" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
