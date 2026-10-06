import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the student-view course preview: banner, hero, curriculum list.
export default function Loading() {
  return (
    <PageSkeleton label="Loading preview" className="min-h-screen space-y-0 bg-background p-0 lg:p-0">
      <div className="border-b bg-warning/10 px-4 py-2">
        <div className="mx-auto flex h-6 max-w-5xl items-center justify-between gap-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
      </div>
      <div className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start lg:gap-10">
            <Skeleton className="aspect-video w-full shrink-0 rounded-2xl md:w-80 lg:w-96" />
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-9 w-4/5 md:h-10" />
                <Skeleton className="h-5 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-end justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-md" />
                </div>
                <Skeleton className="h-3 w-full rounded-full" />
              </div>
              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <Skeleton className="h-12 flex-1 rounded-md md:h-14" />
                <Skeleton className="h-12 flex-1 rounded-md md:h-14" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border-2 border-transparent bg-muted/30 p-5 md:p-6">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <Skeleton className="hidden h-8 w-16 rounded-md sm:block" />
              <Skeleton className="h-5 w-5 rounded sm:hidden" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
