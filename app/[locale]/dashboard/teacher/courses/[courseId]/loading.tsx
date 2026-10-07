import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the course editor: sticky header, tab strip, curriculum rows.
export default function Loading() {
  return (
    <div className="flex-1" role="status" aria-busy="true" aria-live="polite">
      <div className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto w-full container px-6 py-4 lg:px-8">
          <PageHeaderSkeleton back actions={4} />
        </div>
      </div>
      <PageShell variant="wide" skeleton>
        <Skeleton className="h-9 w-full min-w-full rounded-lg" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-32 rounded-md" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-48 max-w-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    </div>
  )
}
