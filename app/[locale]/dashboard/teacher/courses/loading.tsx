import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

export default function Loading() {
  return (
    <PageShell variant="default" skeleton>
      <PageHeaderSkeleton actions={1} />

      <div className="flex flex-col gap-4">
        {/* Search / status / sort / view */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-full rounded-md sm:w-36" />
          </div>
          <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-full rounded-md sm:w-40" />
          </div>
          <Skeleton className="h-8 w-[3.75rem] rounded-md" />
        </div>

        {/* Result count */}
        <Skeleton className="h-4 w-24" />

        {/* Course cards */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-card bg-card py-4 ring-1 ring-foreground/10"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="mt-4 space-y-2 px-4 pb-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="flex flex-col gap-4 px-4">
                <div className="grid grid-cols-3 gap-1 border-y border-border/40 py-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="flex flex-col items-center gap-1">
                      <Skeleton className="h-4 w-6" />
                      <Skeleton className="h-2 w-12" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-7 flex-1 rounded-md" />
                  <Skeleton className="h-7 flex-1 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
