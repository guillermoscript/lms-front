import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors store/page.tsx + StoreSection: h1/subtitle, section header with balance pill, 4-col item grid. */
export default function StoreLoading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <Skeleton className="h-14 w-36 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    </PageShell>
  )
}
