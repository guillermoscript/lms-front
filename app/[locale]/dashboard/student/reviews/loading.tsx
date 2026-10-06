import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading reviews"
      className="mx-auto container max-w-2xl p-0 lg:p-0 py-8 px-4 lg:py-8 lg:px-8"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>

      <div className="space-y-5">
        {/* Progress row */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        {/* Flashcard */}
        <Skeleton className="min-h-64 w-full rounded-2xl" />
        {/* Reveal button */}
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-10 w-full sm:w-36 rounded-md" />
          <Skeleton className="hidden sm:block h-4 w-44" />
        </div>
      </div>
    </PageSkeleton>
  )
}
