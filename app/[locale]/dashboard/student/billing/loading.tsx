import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

function TableCard({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-4 border-b bg-muted/20 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={i === cols - 1 ? 'ml-auto h-3 w-14' : 'h-3 w-20'} />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-14 items-center gap-4 px-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mirrors billing/page.tsx: max-w-4xl, header, subscription card, purchases table, offline table. */
export default function BillingLoading() {
  return (
    <PageSkeleton
      label="Loading billing"
      className="container mx-auto max-w-4xl space-y-8 p-0 px-4 py-8 lg:p-0 lg:px-4 lg:py-8"
    >
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>

      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="space-y-3 rounded-xl border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-4 w-36" />
        <TableCard rows={5} cols={5} />
      </div>

      <div>
        <Skeleton className="mb-3 h-4 w-40" />
        <TableCard rows={3} cols={4} />
      </div>
    </PageSkeleton>
  )
}
