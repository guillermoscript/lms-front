import { Skeleton } from '@/components/ui/skeleton'
import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'

// Mirrors exercises/page.tsx: back link + header + CTA, type chips, exercise rows.
export default function Loading() {
  return (
    <PageShell variant="default" skeleton>
      <PageHeaderSkeleton back actions={1} />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex flex-1 items-center gap-4 rounded-xl border p-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-4 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
