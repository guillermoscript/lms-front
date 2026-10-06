import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Prompt grading: header (back, course, title, badges), prompt card, roster.
export default function Loading() {
  return (
    <PageSkeleton label="Loading grading" className="min-h-screen space-y-0 bg-background p-0 lg:p-0">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-3xl space-y-2 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-2 rounded-xl border-l-4 border-primary bg-card p-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="divide-y rounded-xl border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
