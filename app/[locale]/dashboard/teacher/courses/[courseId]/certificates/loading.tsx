import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading certificates"
      className="mx-auto container flex-none space-y-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-6"
    >
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-52" />
      </div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Template preview */}
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-4 w-36" />
          <div className="space-y-4">
            <Skeleton className="aspect-[1.414/1] w-full rounded-lg" />
            <div className="space-y-3 px-1">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>
        {/* Issued table + eligible */}
        <div className="space-y-8 lg:col-span-3">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-3">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-1/5" />
                <Skeleton className="h-3 w-1/5" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
                  <div className="flex w-1/4 items-center gap-2.5">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                  <Skeleton className="h-4 w-1/5" />
                  <Skeleton className="h-6 w-1/5 rounded" />
                  <Skeleton className="ml-auto h-7 w-7 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-44" />
            <div className="divide-y overflow-hidden rounded-xl border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
