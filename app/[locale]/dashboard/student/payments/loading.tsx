import { Skeleton } from '@/components/ui/skeleton'

export default function PaymentsLoading() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-5 w-56" />
      </div>

      {/* Info alert */}
      <Skeleton className="h-12 w-full rounded-lg mb-6" />

      {/* Table */}
      <div className="rounded-lg border hidden md:block">
        <div className="p-6 border-b space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-6">
          {/* Table header */}
          <div className="grid grid-cols-5 gap-4 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 py-4 border-t">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
