import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton, PageShell } from '@/components/dashboard/page-shell'

export default function Loading() {
  return (
    <PageShell variant="default" skeleton>
      <PageHeaderSkeleton />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    </PageShell>
  )
}
