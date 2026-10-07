import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors certificates/page.tsx: icon+title header with action, 3 stat tiles, certificate cards. */
export default function CertificatesLoading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton actions={1} />

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}
