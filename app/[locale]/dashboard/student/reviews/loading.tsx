import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton />

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
    </PageShell>
  )
}
