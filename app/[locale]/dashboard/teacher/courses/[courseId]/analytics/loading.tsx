import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Mirrors course analytics: header + look-back window buttons, two cards.
export default function Loading() {
  return (
    <PageSkeleton label="Loading analytics" className="min-h-screen space-y-0 bg-background p-0 pb-20 lg:p-0">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-40" />
              </div>
              <Skeleton className="ml-10 h-4 w-64 max-w-full" />
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={4} />
      </div>
    </PageSkeleton>
  )
}
