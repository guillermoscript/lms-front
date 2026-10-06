import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton label="Loading community" className="min-h-screen space-y-0 bg-background p-0 lg:p-0">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {/* Composer */}
        <Skeleton className="h-20 w-full rounded-xl" />

        {/* Filters */}
        <div className="flex gap-2">
          {[16, 20, 24, 16].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w * 4 }} />
          ))}
        </div>

        {/* Posts */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Skeleton className="h-7 w-16 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </PageSkeleton>
  )
}
