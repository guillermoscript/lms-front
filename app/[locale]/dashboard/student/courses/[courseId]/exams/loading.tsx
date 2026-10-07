import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors exams/page.tsx: same wide shell + header, progress tile, exam cards.
export default function Loading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton back />
      <div className="bg-card border rounded-2xl p-4 shadow-sm w-full sm:max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-10" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border overflow-hidden flex flex-col md:flex-row">
            <div className="flex-1 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl shrink-0" />
                <div className="space-y-2 flex-1 min-w-0">
                  <Skeleton className="h-6 w-2/5" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-3 w-full sm:w-auto sm:min-w-[140px]">
                <Skeleton className="h-9 w-20 sm:ml-auto" />
                <Skeleton className="h-10 w-full sm:w-36 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
