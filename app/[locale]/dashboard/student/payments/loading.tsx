import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors payments/page.tsx: container, icon+h1 header, info alert, desktop table card / mobile cards. */
export default function PaymentsLoading() {
  return (
    <PageSkeleton
      label="Loading payments"
      className="container mx-auto space-y-0 p-0 px-4 py-8 lg:p-0 lg:px-4 lg:py-8"
    >
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-6 w-56 max-w-full" />
      </div>

      <div className="space-y-6">
        <Skeleton className="h-11 w-full rounded-lg" />

        {/* Desktop table */}
        <div className="hidden rounded-xl border md:block">
          <div className="space-y-1.5 p-6 pb-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="px-6 pb-4">
            <div className="grid grid-cols-5 gap-4 border-b py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-16" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid h-14 grid-cols-5 items-center gap-4 border-b last:border-0">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-4 md:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
