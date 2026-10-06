import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the course editor: sticky header, tab strip, curriculum rows.
export default function Loading() {
  return (
    <PageSkeleton label="Loading course" className="min-h-screen space-y-0 bg-background p-0 pb-20 lg:p-0">
      <div className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-64 max-w-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="ml-10 h-4 w-48" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Skeleton className="h-9 w-full min-w-full rounded-lg" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-48 max-w-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
