import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors exercises/[exerciseId]/page.tsx: breadcrumb bar, then on lg a fixed
// two-pane shell (instructions | work area) that fills the viewport.
export default function Loading() {
  return (
    <PageSkeleton
      label="Loading exercise"
      className="p-0 lg:p-0 space-y-0 flex-none"
    >
      <div className="mx-auto container px-3 py-3 sm:px-4 sm:py-6 lg:flex lg:h-[calc(100dvh-4rem)] lg:max-w-none lg:flex-col lg:overflow-hidden lg:px-8 lg:py-0 space-y-3 sm:space-y-6 lg:space-y-0">
        <div className="lg:shrink-0 lg:border-b lg:py-3">
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <div className="lg:min-h-0 lg:flex-1 lg:py-4">
          <div className="grid gap-4 lg:h-full lg:grid-cols-2 lg:gap-6">
            <div className="rounded-xl border p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <Skeleton className="h-7 w-2/3" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <div className="rounded-xl border p-5 flex flex-col gap-4 min-h-[320px] lg:min-h-0">
              <Skeleton className="flex-1 w-full rounded-lg min-h-[200px]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 flex-1 rounded-md" />
                <Skeleton className="h-10 w-10 rounded-md shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
