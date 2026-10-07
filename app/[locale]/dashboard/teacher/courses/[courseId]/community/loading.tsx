import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

// Course community feed: same reading shell + header as page.tsx, then the feed.
export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton back />
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
