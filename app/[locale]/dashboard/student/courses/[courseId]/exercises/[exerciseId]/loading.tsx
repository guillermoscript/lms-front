import { PageShell } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { ExerciseWorkPaneSkeleton } from './exercise-skeletons'

// Mirrors exercises/[exerciseId]/page.tsx: breadcrumb bar, then on lg a fixed
// two-pane shell (instructions | work area) that fills the viewport.
export default function Loading() {
  return (
    <PageShell
      skeleton
      className="lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-hidden lg:py-0 lg:space-y-0"
    >
      <div className="lg:shrink-0 lg:border-b lg:py-3">
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="lg:min-h-0 lg:flex-1">
        <div className="grid gap-4 lg:h-full lg:grid-cols-2 lg:gap-6">
          <div className="rounded-xl border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <Skeleton className="h-7 w-2/3" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <ExerciseWorkPaneSkeleton />
        </div>
      </div>
    </PageShell>
  )
}
