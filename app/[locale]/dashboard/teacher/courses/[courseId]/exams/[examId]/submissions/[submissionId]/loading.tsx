import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back description={false} />
      <div className="space-y-8">
        {/* Summary header */}
        <div className="flex flex-col justify-between gap-4 rounded-xl border bg-muted/30 p-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center gap-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-14" />
              </div>
            ))}
          </div>
        </div>
        {/* Questions */}
        <div className="space-y-6">
          <Skeleton className="h-7 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-l-4 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-36 rounded-full" />
                  <Skeleton className="h-5 w-4/5" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-11 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>
    </PageShell>
  )
}
