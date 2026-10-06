import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors result/page.tsx: breadcrumb, score hero, status card, detailed question review.
export default function Loading() {
  return (
    <PageSkeleton label="Loading exam result" className="p-0 lg:p-0 space-y-0">
      <div className="container mx-auto py-5 sm:py-8 px-4 space-y-5 sm:space-y-8">
        <Skeleton className="h-5 w-72 max-w-full" />

        <div className="rounded-2xl sm:rounded-3xl border p-5 sm:p-8 md:p-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-8">
            <div className="space-y-3 sm:space-y-4 w-full md:flex-1 flex flex-col items-center md:items-start">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-10 sm:h-12 w-3/4 max-w-md" />
              <Skeleton className="h-4 w-full max-w-lg" />
              <Skeleton className="h-4 w-48 mt-2 sm:mt-4" />
            </div>
            <Skeleton className="h-40 sm:h-48 w-full md:w-[200px] rounded-2xl shrink-0" />
          </div>
        </div>

        <Skeleton className="h-24 w-full rounded-xl" />

        <div className="space-y-4 sm:space-y-6">
          <Skeleton className="h-8 w-56" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                  <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0" />
                </div>
                <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 grid gap-2.5 sm:gap-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
