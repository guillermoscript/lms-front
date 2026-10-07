import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

const CARD = "rounded-card bg-card ring-1 ring-foreground/10"

function StatTile() {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-16" />
          <Skeleton className="mt-1 h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <PageShell variant="default" skeleton>
      <PageHeaderSkeleton actions={2} />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTile key={i} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Courses */}
        <div className={`${CARD} py-4 lg:col-span-4`}>
          <div className="flex items-center justify-between px-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
          <div className="mt-4 space-y-1 px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className={`${CARD} py-4 lg:col-span-3`}>
          <div className="space-y-1.5 px-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="mt-4 space-y-5 px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
          <div className="mx-4 mt-6 rounded-xl bg-primary/[0.04] p-4 ring-1 ring-primary/10">
            <div className="mb-1.5 flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="ml-[38px] h-3 w-3/4" />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
