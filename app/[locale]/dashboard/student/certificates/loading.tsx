import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors certificates/page.tsx: icon+title header with action, 3 stat tiles, certificate cards. */
export default function CertificatesLoading() {
  return (
    <PageSkeleton
      label="Loading certificates"
      className="container mx-auto space-y-6 p-0 px-4 py-8 lg:p-0 lg:px-8 lg:py-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-8 w-44" />
          </div>
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

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
    </PageSkeleton>
  )
}
