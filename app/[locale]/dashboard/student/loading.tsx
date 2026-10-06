import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

function SideCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="p-2 space-y-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="size-9 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="sm:w-48 h-32 sm:h-36 shrink-0 rounded-none" />
        <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="mt-3 sm:mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-9" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <PageSkeleton
      label="Loading dashboard"
      className="p-0 lg:p-0 space-y-0 min-h-screen bg-background"
    >
      <div className="container mx-auto px-4 md:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* WelcomeHero */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2">
          <div className="space-y-1">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-5 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-40 rounded-md shrink-0" />
        </div>

        {/* StatsCards */}
        <div className="flex items-center gap-3 sm:gap-6 h-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-5" />
              <Skeleton className="hidden sm:block h-4 w-28" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Courses */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-44" />
                <Skeleton className="h-5 w-14" />
              </div>
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <ProgressCardSkeleton key={i} />
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <SideCardSkeleton rows={2} />
            <SideCardSkeleton rows={4} />
            <SideCardSkeleton rows={3} />
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
