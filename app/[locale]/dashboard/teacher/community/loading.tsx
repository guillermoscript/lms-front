import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-busy="true" aria-label="Loading community">
      <span className="sr-only">Loading...</span>

      {/* Header bar */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8 space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
      </header>

      {/* Feed area */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        {/* Post composer placeholder */}
        <Skeleton className="h-20 w-full rounded-xl" />

        {/* Post skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            {/* Author row */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            {/* Content */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            {/* Reactions row */}
            <div className="flex items-center gap-3 pt-1">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
