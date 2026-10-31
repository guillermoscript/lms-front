import { PageShell } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function MemberChallengeLoading() {
  return (
    <PageShell variant="reading" skeleton>
      <Skeleton className="h-4 w-64" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-48 w-full" />
    </PageShell>
  )
}
