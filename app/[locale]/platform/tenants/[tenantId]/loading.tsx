import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-16" />
          </div>
        ))}
      </div>

      {/* Two-column cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border">
            <div className="px-6 py-4 border-b">
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Transactions table */}
        <div className="rounded-xl border lg:col-span-2">
          <div className="px-6 py-4 border-b">
            <Skeleton className="h-5 w-40" />
          </div>
          <div>
            <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                <Skeleton className="h-4 w-20 font-mono" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
