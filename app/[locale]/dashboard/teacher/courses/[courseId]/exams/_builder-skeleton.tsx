import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mirrors ExamBuilderShell (breadcrumb + details card + questions + actions).
 * Single root element so it sits in PageShell exactly like the real builder.
 * Shared by both exam loading.tsx files and the next/dynamic fallbacks.
 */
export function ExamBuilderSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-6">
        <div className="space-y-5 rounded-xl border p-6">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-7 w-36 rounded-md" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-4 rounded-xl border p-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-6">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}
