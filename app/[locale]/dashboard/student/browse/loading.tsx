import { Skeleton } from '@/components/ui/skeleton'

export default function BrowseCoursesLoading() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-5 w-64" />
      </div>

      {/* Subscription Alert */}
      <Skeleton className="h-24 w-full rounded-lg mb-8" />

      {/* Search Bar */}
      <Skeleton className="h-10 w-full max-w-md mb-6" />

      {/* Course count */}
      <Skeleton className="h-4 w-32 mb-4" />

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border overflow-hidden">
            <Skeleton className="h-40 w-full" />
            <div className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-9 w-full mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
