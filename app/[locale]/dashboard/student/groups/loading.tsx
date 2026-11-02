import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton, PageShell } from '@/components/dashboard/page-shell'

export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </PageShell>
  )
}
