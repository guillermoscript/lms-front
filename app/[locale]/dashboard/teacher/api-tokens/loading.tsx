import { Skeleton } from "@/components/ui/skeleton"

const CARD = "rounded-card bg-card ring-1 ring-foreground/10 py-4"

/** Page shell is `p-6 lg:p-8` > `space-y-6`; PageSkeleton's chrome is replicated here. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="p-6 lg:p-8 animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading API tokens…</span>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-8 w-32 shrink-0 rounded-md" />
        </div>

        {/* Connect Claude card */}
        <div className={`${CARD} flex flex-col gap-4`}>
          <div className="space-y-1.5 px-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-4/5" />
              ))}
            </div>
          </div>
        </div>

        {/* How to connect */}
        <div className={CARD}>
          <div className="flex items-center justify-between px-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </div>

        {/* Tokens */}
        <div className={`${CARD} flex flex-col gap-4`}>
          <div className="space-y-1.5 px-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="divide-y px-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
