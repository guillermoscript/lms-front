import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

function FieldSkeleton({ area = false }: { area?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className={area ? 'h-24 w-full rounded-md' : 'h-9 w-full rounded-md'} />
    </div>
  )
}

// Mirrors course settings: header, form, toggles, danger zone (same shell, space-y-6 rhythm).
export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back />
      <div className="space-y-6">
        <FieldSkeleton />
        <FieldSkeleton area />
        <div className="grid gap-6 sm:grid-cols-2">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-px w-full" />
      <div className="space-y-2 rounded-lg border border-destructive/30 p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="mt-2 h-9 w-36 rounded-md" />
      </div>
    </PageShell>
  )
}
