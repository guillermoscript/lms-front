import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors store/page.tsx + StoreSection: h1/subtitle, section header with balance pill, 4-col item grid. */
export default function StoreLoading() {
  return (
    <PageSkeleton
      label="Loading store"
      className="container mx-auto space-y-0 p-0 px-4 py-8 lg:p-0 lg:px-4 lg:py-8"
    >
      <div className="mb-8">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-1 h-6 w-56 max-w-full" />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <Skeleton className="h-14 w-36 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
