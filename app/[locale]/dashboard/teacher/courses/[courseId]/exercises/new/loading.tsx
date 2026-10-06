import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

// Mirrors new/edit exercise page: container, breadcrumb, builder toolbar (step nav + actions), form cards.
export default function Loading() {
  return (
    <PageSkeleton
      label="Loading exercise builder"
      className="container mx-auto flex-none space-y-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-6"
    >
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="space-y-4 rounded-xl border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
        <div className="space-y-4 rounded-xl border p-6">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
