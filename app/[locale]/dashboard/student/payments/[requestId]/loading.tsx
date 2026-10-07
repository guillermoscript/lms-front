import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors payments/[requestId]/page.tsx: form shell, back link + title, one detail card. */
export default function PaymentDetailLoading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back description={false} />

      <div className="rounded-xl border">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-5 w-24 shrink-0 rounded-full" />
        </div>
        <div className="space-y-5 px-6 pb-6">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
          <Skeleton className="h-px w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <Skeleton className="h-px w-full" />
          <div className="flex justify-end">
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
