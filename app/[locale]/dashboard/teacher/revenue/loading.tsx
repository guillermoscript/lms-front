import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

const CARD = "rounded-card bg-card ring-1 ring-foreground/10"

export default function Loading() {
  return (
    <PageSkeleton label="Loading revenue">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
      </div>

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-8 w-24" />
                <Skeleton className="mt-1 h-3 w-32" />
              </div>
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Split card */}
      <div className={`${CARD} flex flex-col gap-4 py-4`}>
        <div className="space-y-1.5 px-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <div className="grid gap-4 px-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Tabs + table */}
      <div className="space-y-4">
        <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
        <div className={`${CARD} py-2`}>
          <div className="flex items-center gap-4 border-b px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
