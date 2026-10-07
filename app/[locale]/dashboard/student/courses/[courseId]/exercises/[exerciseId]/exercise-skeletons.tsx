import { Skeleton } from '@/components/ui/skeleton'

/**
 * Work-pane placeholder. Shared by loading.tsx (right pane) and every
 * dynamic() fallback in page.tsx, so each swap lands on the same geometry.
 */
export function ExerciseWorkPaneSkeleton() {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4 min-h-[320px] lg:min-h-0 lg:h-full">
      <Skeleton className="flex-1 w-full rounded-lg min-h-[200px]" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-md shrink-0" />
      </div>
    </div>
  )
}
