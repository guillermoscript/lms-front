import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto container space-y-6 px-4 py-8 sm:px-6 lg:px-8" role="status" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid h-[calc(100dvh-16rem)] min-h-[26rem] gap-4 lg:h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between rounded-card bg-card p-4 ring-1 ring-foreground/10">
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-40 rounded-full" />
              <Skeleton className="h-8 w-36 rounded-full" />
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        </div>
        <div className="hidden space-y-2 rounded-card bg-card p-4 ring-1 ring-foreground/10 lg:block">
          <Skeleton className="h-6 w-2/3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
