import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="p-6 lg:p-8 space-y-6" role="status" aria-busy="true" aria-label="Loading API tokens">
      <span className="sr-only">Loading...</span>

      {/* Header with create button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* MCP URL card */}
      <div className="rounded-xl border p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>

      {/* Tokens list */}
      <div className="rounded-xl border">
        <div className="p-6 space-y-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="px-6 pb-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
