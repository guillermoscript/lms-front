import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mirrors ExerciseBuilder: toolbar (step nav + actions) + form cards.
 * Rendered below PageHeader/PageHeaderSkeleton, by loading.tsx and by the
 * next/dynamic fallback, so both stages have identical geometry.
 */
export function ExerciseBuilderSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-28 rounded-md" />
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
    </div>
  )
}
