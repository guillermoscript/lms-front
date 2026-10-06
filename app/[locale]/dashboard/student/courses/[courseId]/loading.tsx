import { Skeleton } from '@/components/ui/skeleton'
import { PageSkeleton } from '@/components/skeletons'

export default function CourseDetailLoading() {
  return (
    <PageSkeleton
      label="Loading course"
      className="flex-none min-h-screen bg-background p-0 lg:p-0 space-y-0"
    >
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:py-6 md:py-8 sm:px-6 lg:px-8">
          {/* Back link */}
          <Skeleton className="h-5 w-40 mb-6" />

          <div className="flex flex-col gap-6 md:flex-row md:items-start lg:gap-10">
            {/* Thumbnail */}
            <Skeleton className="aspect-video w-full shrink-0 rounded-2xl md:w-80 lg:w-96" />

            <div className="flex-1 space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-8 md:h-9 lg:h-10 w-4/5" />
                <Skeleton className="h-5 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>

              {/* Progress */}
              <div className="pt-2 space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <Skeleton className="h-8 w-14" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-md" />
                </div>
                <Skeleton className="h-3 w-full rounded-full" />
              </div>

              {/* Actions */}
              <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                <Skeleton className="h-12 md:h-14 flex-1 rounded-lg" />
                <Skeleton className="h-12 md:h-14 flex-1 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-5 sm:mb-8">
          <Skeleton className="h-7 sm:h-8 w-40" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 md:p-6 rounded-2xl border-2 border-transparent bg-muted/30"
            >
              <Skeleton className="size-10 sm:size-12 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-5 w-3/4" />
              </div>
              <Skeleton className="hidden sm:block h-8 w-20 rounded-md shrink-0" />
              <Skeleton className="sm:hidden size-5 rounded shrink-0" />
            </div>
          ))}
        </div>
      </main>
    </PageSkeleton>
  )
}
