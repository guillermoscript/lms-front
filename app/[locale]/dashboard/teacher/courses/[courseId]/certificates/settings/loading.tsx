import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading certificate settings"
      className="mx-auto container flex-none space-y-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-6"
    >
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Form side */}
        <div className="space-y-8 lg:col-span-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-3 border-t pt-4">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
        {/* Preview side */}
        <div className="lg:col-span-2">
          <Skeleton className="aspect-[1.414/1] w-full rounded-lg" />
        </div>
      </div>
    </PageSkeleton>
  )
}
