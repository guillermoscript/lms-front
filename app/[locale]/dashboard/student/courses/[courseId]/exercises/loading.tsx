import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors exercises/page.tsx: same default shell + header, type filter pills, 3-col card grid.
export default function Loading() {
  return (
    <PageShell skeleton>
      <PageHeaderSkeleton back />
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-wrap gap-2">
          {[20, 28, 24, 28].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-14 rounded-md ml-auto" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-3/4" />
                <div className="min-h-[40px] space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2.5 sm:mt-4 sm:pt-3 border-t border-border/50">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
