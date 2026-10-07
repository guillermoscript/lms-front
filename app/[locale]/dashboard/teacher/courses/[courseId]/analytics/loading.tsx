import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
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
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton back actions={3} />
      <div className="space-y-6">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={4} />
      </div>
    </PageShell>
  )
}
