import { Skeleton } from '@/components/ui/skeleton'
import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'

export default function BrowseCoursesLoading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton />

      {/* Subscription alert */}
      <Skeleton className="h-[140px] w-full rounded-lg" />

      {/* Search + category pills */}
      <div className="space-y-4 mb-8">
        <Skeleton className="h-10 w-full max-w-md rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* Count */}
      <Skeleton className="h-5 w-36 mb-4" />

      {/* Cards: video thumb, header, body, footer button */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="px-4 pt-4 pb-3 space-y-2">
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-5 w-1/2" />
            </div>
            <div className="flex-1 px-4 pb-3 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <div className="px-4 py-3 border-t">
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
